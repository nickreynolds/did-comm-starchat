import { IAgentContext, ICredentialPlugin, IDIDManager, IKeyManager } from '@veramo/core-types'
import { VerifiableCredential } from '@veramo/core'
import { AbstractMessageHandler, Message } from '@veramo/message-handler'
import Debug from 'debug'
import { v4 } from 'uuid'
import { DIDCommMessageMediaType, IDIDComm } from '@veramo/did-comm'
import { IDIDCommMessage } from '@veramo/did-comm'
import { getAnswer } from './starchat-helper.js'

const debug = Debug('veramo:did-comm:ml-text-generation-message-handler')

type IContext = IAgentContext<IDIDManager & IKeyManager & IDIDComm & ICredentialPlugin>

export const ML_TEXT_GENERATION_QUESTION_MESSAGE_TYPE = 'https://veramo.io/didcomm/ml-text-generation/1.0/question'
export const ML_TEXT_GENERATION_RESPONSE_MESSAGE_TYPE = 'https://veramo.io/didcomm/ml-text-generation/1.0/response'

export function createMLTextGenerationQuestionMessage(queryInput: string, senderDidUrl: string, recipientDidUrl: string, thid: string, returnRoute: boolean): IDIDCommMessage {
  return {
    type: ML_TEXT_GENERATION_QUESTION_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: v4(),
    thid,
    body: {
      queryInput
    },
    return_route: returnRoute ? 'all' : 'none'
  }
}

export function createMLTextGenerationResponse(senderDidUrl: string, recipientDidUrl: string, questionId: string, questionThid: string, credential: VerifiableCredential): IDIDCommMessage {
  return {
    type: ML_TEXT_GENERATION_RESPONSE_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: `${questionId}-response`,
    thid: questionThid,
    body: credential
  }
}

/**
 * A plugin for the {@link @veramo/message-handler#MessageHandler} that handles Starchat messages.
 * @beta This API may change without a BREAKING CHANGE notice.
 */
export class MLTextGenerationQuestionMessageHandler extends AbstractMessageHandler {
  private hfToken: string
  constructor(hfToken: string) {
    super()
    this.hfToken = hfToken
  }

  /**
   * Handles a Star Chat Message
   * https://identity.foundation/didcomm-messaging/spec/#trust-ping-protocol-10
   */
  public async handle(message: Message, context: IContext): Promise<Message> {
    if (message.type === ML_TEXT_GENERATION_QUESTION_MESSAGE_TYPE) {
      debug('ML Text Generation Question Message Received')
      try {
        const { from, to, id, data, returnRoute, threadId } = message
        if (!from) {
          throw new Error("invalid_argument: Starchat Message received without `from` set")
        }
        if (!to) {
          throw new Error("invalid_argument: Starchat Message received without `to` set")
        }

        if (!data.queryInput) {
          throw new Error("invalid_argument: Starchat Message received without `body.queryInput` set")
        }

        const answer = await getAnswer(data.queryInput, this.hfToken)
        const cred = await context.agent.createVerifiableCredential({
          credential: {
            issuer: { id: to },
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential', 'TextGenerationAnswer'],
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              id: from,
              question: data.queryInput,
              answer,
              model: "HuggingFaceH4/starchat-beta",
              license: "bigcode-openrail-m",
              linkedPapers: ["arxiv:1911.02150", "arxiv:2205.14135"]
            }
          },
          proofFormat: 'jwt'
        })

        const response = createMLTextGenerationResponse(to!, from!, id, threadId, cred)
        const packedResponse = await context.agent.packDIDCommMessage({ message: response, packing: 'authcrypt'})
        
        let sent
        if (returnRoute === 'all') {
          // attempt to re-use connection
          const returnResponse = {
            id: response.id,
            message: packedResponse.message,
            contentType: DIDCommMessageMediaType.ENCRYPTED,
          }
          message.addMetaData({ type: 'ReturnRouteResponse', value: JSON.stringify(returnResponse) })
        } else {
          // don't attempt to re-use
          sent = await context.agent.sendDIDCommMessage({
            messageId: response.id,
            packedMessage: packedResponse,
            recipientDidUrl: from!,
          })
        }
        

        message.addMetaData({ type: 'StarchatResponseSent', value: sent })
      } catch (ex) {
        debug(ex)
      }
      return message
    }

    return super.handle(message, context)
  }
}
