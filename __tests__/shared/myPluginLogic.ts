// noinspection ES6PreferShortImport

import { TAgent, IMessageHandler, ICredentialPlugin, IDIDManager, IKeyManager, IDataStore, IDataStoreORM, IResolver } from '@veramo/core-types'
import { createMLTextGenerationQuestionMessage } from '../../src/message-handler/ml-text-generation-message-handler.js'
import { IDIDComm } from '@veramo/did-comm'
import { ICredentialIssuerLD } from '@veramo/credential-ld'
import { MessagingRouter, RequestWithAgentRouter } from '@veramo/remote-server'
import express from 'express'
import { Server } from 'http'

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
    let didCommEndpointServer: Server
    let listeningPort = Math.round(Math.random() * 32000 + 2048)

    beforeAll(async () => {
      await testContext.setup()
      agent = testContext.getAgent()

      const requestWithAgent = RequestWithAgentRouter({ agent })
      await new Promise((resolve) => {
        //setup a server to receive HTTP messages and forward them to this agent to be processed as DIDComm messages
        const app = express()
        // app.use(requestWithAgent)
        app.use(
          '/messaging',
          requestWithAgent,
          MessagingRouter({
            metaData: { type: 'DIDComm', value: 'integration test' },
          }),
        )
        didCommEndpointServer = app.listen(listeningPort, () => {
          resolve(true)
        })
      })
    })
    afterAll(async () => {
      await testContext.tearDown()
    })

    it('should correctly send between 2 DIDs with service endpoitns', async () => {
      const sender = await agent.didManagerCreate({
        "alias": "sender",
        "provider": "did:peer",
        "kms": "local",
        "options": {
          "num_algo":2 , 
          "service" : {
            "id":"12344",
            "type":"DIDCommMessaging",
            "serviceEndpoint":`http://localhost:${listeningPort}/messaging`,
            "description":"an endpoint"
          }
        }
      })
      const receiver = await agent.didManagerCreate({
        "alias": "receiver",
        "provider": "did:peer",
        "kms": "local",
        "options": {
          "num_algo":2 , 
          "service" : {
            "id":"12345",
            "type":"DIDCommMessaging",
            "serviceEndpoint":`http://localhost:${listeningPort}/messaging`,
            "description":"an endpoint"
          }
        }
      })

      const questionMessage = createMLTextGenerationQuestionMessage("What is rice?", sender.did, receiver.did, "thid1", false)
      const packed = await agent.packDIDCommMessage({
        packing: 'authcrypt',
        message: questionMessage
      })

      // const res = await agent.handleMessage({ raw: packed.message })
      // console.log("res: ", res)

      const res = await agent.sendDIDCommMessage({ 
        messageId: 'somefakeid1', 
        packedMessage: packed, 
        recipientDidUrl: receiver.did
      })
      console.log("res: ", res)
      
      expect(res).toBeDefined()
    })

    it('should correctly send when sender has no service endpoint', async () => {
      const sender2 = await agent.didManagerCreate({
        "alias": "sender2",
        "provider": "did:peer",
        "kms": "local",
        "options": {
          "num_algo":2,
          "service": {
            "id": "badid123",
            "type": "nothing",
            "serviceEndpoint": "http://doesnwork",
            "description": "will not work"
          }
        }
      })
      const receiver2 = await agent.didManagerCreate({
        "alias": "receiver2",
        "provider": "did:peer",
        "kms": "local",
        "options": {
          "num_algo":2 , 
          "service" : {
            "id":"123456",
            "type":"DIDCommMessaging",
            "serviceEndpoint":`http://localhost:${listeningPort}/messaging`,
            "description":"an endpoint"
          }
        }
      })

      const questionMessage = createMLTextGenerationQuestionMessage("What is corn?", sender2.did, receiver2.did, "thid2", true)
      const packed = await agent.packDIDCommMessage({
        packing: 'authcrypt',
        message: questionMessage
      })

      // const res = await agent.handleMessage({ raw: packed.message })
      // console.log("res: ", res)

      const res2 = await agent.sendDIDCommMessage({ 
        messageId: 'somefakeid2', 
        packedMessage: packed, 
        recipientDidUrl: receiver2.did
      })
      console.log("res2: ", res2)
      
      expect(res2).toBeDefined()
    })
  })
}
