import { IAgentContext, ICredentialPlugin, IDIDManager, IKeyManager } from '@veramo/core-types'
import { VerifiableCredential } from '@veramo/core'
import { AbstractMessageHandler, Message } from '@veramo/message-handler'
import Debug from 'debug'
import { v4 } from 'uuid'
import { DIDCommMessageMediaType, IDIDComm } from '@veramo/did-comm'
import { IDIDCommMessage } from '@veramo/did-comm'
import { getAnswer } from './starchat-helper.js'

const debug = Debug('veramo:did-comm:trust-ping-message-handler')

type IContext = IAgentContext<IDIDManager & IKeyManager & IDIDComm & ICredentialPlugin>

const STARCHAT_QUESTION_MESSAGE_TYPE = 'https://veramo.io/didcomm/starchat/1.0/question'
const STARCHAT_RESPONSE_MESSAGE_TYPE = 'https://veramo.io/didcomm/starchat/1.0/response'

export function createStarchatQuestionMessage(queryInput: string, senderDidUrl: string, recipientDidUrl: string, returnRoute: boolean): IDIDCommMessage {
  return {
    type: STARCHAT_QUESTION_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: v4(),
    thid: v4(),
    body: {
      responseRequested: true,
      queryInput
    },
    return_route: returnRoute ? 'all' : 'none'
  }
}

export function createStarchatResponse(senderDidUrl: string, recipientDidUrl: string, questionId: string, questionThid: string, credential: VerifiableCredential): IDIDCommMessage {
  return {
    type: STARCHAT_RESPONSE_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: `${questionId}-response`,
    thid: questionThid,
    body: {},
    attachments: []
  }
}

/**
 * A plugin for the {@link @veramo/message-handler#MessageHandler} that handles Starchat messages.
 * @beta This API may change without a BREAKING CHANGE notice.
 */
export class StarchatQuestionMessageHandler extends AbstractMessageHandler {
  private hfToken: string
  constructor(hfToken: string) {
    console.log("hfToken: ", hfToken)
    super()
    this.hfToken = hfToken
  }

  /**
   * Handles a Star Chat Message
   * https://identity.foundation/didcomm-messaging/spec/#trust-ping-protocol-10
   */
  public async handle(message: Message, context: IContext): Promise<Message> {
    if (message.type === STARCHAT_QUESTION_MESSAGE_TYPE) {
      debug('Starchat Message Received')
      console.log("starchat message received: ", message)
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
        console.log("answer: ", answer)
        const cred = await context.agent.createVerifiableCredential({
          credential: {
            issuer: { id: to },
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential', 'StarchatAnswer'],
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              id: from,
              answer,
              model: "HuggingFaceH4/starchat-beta"
            }
          },
          proofFormat: 'jwt'
        })

        // console.log("cred: ", cred)

        const response = createStarchatResponse(to!, from!, id, threadId, cred)
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
        console.log("something went wrong: ", ex)
        debug(ex)
      }
      return message
    } else if (message.type === STARCHAT_RESPONSE_MESSAGE_TYPE) {
      console.log("received!!!")
      debug('StarchatResponse Message Received. msg: ', message)
      message.addMetaData({ type: 'StarchatResponse', value: 'true'})
      return message
    }

    return super.handle(message, context)
  }
}
