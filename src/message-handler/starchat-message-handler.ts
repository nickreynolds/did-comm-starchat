import { IAgentContext, ICredentialPlugin, IDIDManager, IKeyManager } from '@veramo/core-types'
import { VerifiableCredential } from '@veramo/core'
import { AbstractMessageHandler, Message } from '@veramo/message-handler'
import Debug from 'debug'
import { v4 } from 'uuid'
import { IDIDComm } from '@veramo/did-comm'
import { IDIDCommMessage } from '@veramo/did-comm'
import { getAnswer } from './starchat-helper.js'

const debug = Debug('veramo:did-comm:trust-ping-message-handler')

type IContext = IAgentContext<IDIDManager & IKeyManager & IDIDComm & ICredentialPlugin>

const STARCHAT_QUESTION_MESSAGE_TYPE = 'https://veramo.io/didcomm/starchat/1.0/question'
const STARCHAT_RESPONSE_MESSAGE_TYPE = 'https://veramo.io/didcomm/starchat/1.0/response'

export function createStarchatQuestionMessage(queryInput: string, senderDidUrl: string, recipientDidUrl: string): IDIDCommMessage {
  return {
    type: STARCHAT_QUESTION_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: v4(),
    body: {
      responseRequested: true,
      queryInput
    }
  }
}

export function createStarchatResponse(senderDidUrl: string, recipientDidUrl: string, questionId: string, credential: VerifiableCredential): IDIDCommMessage {
  return {
    type: STARCHAT_RESPONSE_MESSAGE_TYPE,
    from: senderDidUrl,
    to: recipientDidUrl,
    id: `${questionId}-response`,
    thid: questionId,
    body: {},
    attachments: []
  }
}

/**
 * A plugin for the {@link @veramo/message-handler#MessageHandler} that handles Starchat messages.
 * @beta This API may change without a BREAKING CHANGE notice.
 */
export class StarchatQuestionMessageHandler extends AbstractMessageHandler {
  constructor() {
    super()
  }

  /**
   * Handles a Star Chat Message
   * https://identity.foundation/didcomm-messaging/spec/#trust-ping-protocol-10
   */
  public async handle(message: Message, context: IContext): Promise<Message> {
    if (message.type === STARCHAT_QUESTION_MESSAGE_TYPE) {
      debug('Starchat Message Received')
      console.log("message: ", message)
      try {
        const { from, to, id, data } = message
        if (!from) {
          throw new Error("invalid_argument: Starchat Message received without `from` set")
        }
        if (!to) {
          throw new Error("invalid_argument: Starchat Message received without `to` set")
        }

        if (!data.queryInput) {
          throw new Error("invalid_argument: Starchat Message received without `body.queryInput` set")
        }

        const answer = await getAnswer(data.queryInput)

        const cred = await context.agent.createVerifiableCredential({
          credential: {
            issuer: { id: to },
            '@context': ['https://www.w3.org/2018/credentials/v1'],
            type: ['VerifiableCredential', 'StarchatAnswer'],
            issuanceDate: new Date().toISOString(),
            credentialSubject: {
              answer,
              model: "HuggingFaceH4/starchat-beta"
            }
          },
          proofFormat: 'lds'
        })

        console.log("cred: ", cred)

        const response = createStarchatResponse(to!, from!, id, cred)
        const packedResponse = await context.agent.packDIDCommMessage({ message: response, packing: 'authcrypt'})
        const sent = await context.agent.sendDIDCommMessage({
          messageId: response.id,
          packedMessage: packedResponse,
          recipientDidUrl: from!,
        })
        message.addMetaData({ type: 'StarchatResponseSent', value: sent })
      } catch (ex) {
        debug(ex)
      }
      return message
    } else if (message.type === STARCHAT_RESPONSE_MESSAGE_TYPE) {
      debug('StarchatResponse Message Received. msg: ', message)
      message.addMetaData({ type: 'StarchatResponse', value: 'true'})
      return message
    }

    return super.handle(message, context)
  }
}
