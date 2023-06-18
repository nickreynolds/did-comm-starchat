// noinspection ES6PreferShortImport

import { TAgent, IMessageHandler, ICredentialPlugin, IDIDManager, IKeyManager, IDataStore, IDataStoreORM, IResolver } from '@veramo/core-types'
import { createStarchatQuestionMessage } from '../../src/message-handler/starchat-message-handler.js'
import { IDIDComm } from '@veramo/did-comm'
import { ICredentialIssuerLD } from '@veramo/credential-ld'

type ConfiguredAgent = TAgent<
  IDIDManager & 
  IKeyManager & 
  IDIDComm & 
  ICredentialPlugin &
  IMessageHandler
>

export default (testContext: {
  getAgent: () => ConfiguredAgent
  setup: () => Promise<boolean>
  tearDown: () => Promise<boolean>
}) => {
  describe('my plugin', () => {
    let agent: ConfiguredAgent

    beforeAll(async () => {
      await testContext.setup()
      agent = testContext.getAgent()
    })
    afterAll(async () => {
      await testContext.tearDown()
    })

    it('should foo', async () => {
      console.log("should.")
      const did1 = await agent.didManagerCreate({ alias: "did1"})
      const did2 = await agent.didManagerCreate({ alias: "did2"})

      const questionMessage = createStarchatQuestionMessage("What is rice?", did1.did, did2.did)
      const packed = await agent.packDIDCommMessage({
        packing: 'authcrypt',
        message: questionMessage
      })

      const res = await agent.handleMessage({ raw: packed.message })
      console.log("res: ", res)
    })
  })
}
