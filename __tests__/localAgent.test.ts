// noinspection ES6PreferShortImport

/**
 * This runs a suite of ./shared tests using an agent configured for local operations,
 * using a SQLite db for storage of credentials, presentations, messages as well as keys and DIDs.
 *
 * This suite also runs a ganache local blockchain to run through some examples of DIDComm using did:ethr identifiers.
 */

import {
  createAgent,
} from '@veramo/core'
import {
  IAgentOptions,
  ICredentialPlugin,
  IDataStore,
  IDataStoreORM,
  IDIDManager,
  IKeyManager,
  IMessageHandler,
  IResolver,
  TAgent,
} from '@veramo/core-types'
import { MessageHandler } from '@veramo/message-handler'
import { KeyManager } from '@veramo/key-manager'
import { AliasDiscoveryProvider, DIDManager } from '@veramo/did-manager'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { JwtMessageHandler } from '@veramo/did-jwt'
import { CredentialPlugin, W3cMessageHandler } from '@veramo/credential-w3c'
import {
  CredentialIssuerLD,
  ICredentialIssuerLD,
  LdDefaultContexts,
  VeramoEcdsaSecp256k1RecoverySignature2020,
  VeramoEd25519Signature2018,
} from '@veramo/credential-ld'
import { getResolver as getDidPeerResolver, PeerDIDProvider } from '@veramo/did-provider-peer'
import { DIDComm, DIDCommHttpTransport, DIDCommMessageHandler, IDIDComm } from '@veramo/did-comm'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'

import {
  DataStore,
  DataStoreDiscoveryProvider,
  DataStoreORM,
  DIDStore,
  Entities,
  KeyStore,
  migrations,
  PrivateKeyStore,
} from '@veramo/data-store/src'

import { DataSource } from 'typeorm'
import { contexts as credential_contexts } from '@transmute/credentials-context'
import * as fs from 'fs'
import { jest } from '@jest/globals'

// Shared tests
import myPluginLogic from './shared/myPluginLogic'
import { StarchatQuestionMessageHandler } from '../src/message-handler/starchat-message-handler'

jest.setTimeout(60000)

const infuraProjectId = '3586660d179141e3801c3895de1c2eba'
const secretKey = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c'

let agent: TAgent<
  IDIDManager &
    IKeyManager &
    IDataStore &
    IDataStoreORM &
    IResolver &
    IMessageHandler &
    IDIDComm &
    ICredentialPlugin &
    ICredentialIssuerLD
>
let dbConnection: Promise<DataSource>
let databaseFile: string

const setup = async (options?: IAgentOptions): Promise<boolean> => {
  databaseFile =
    options?.context?.databaseFile || ':memory:'
  dbConnection = new DataSource({
    name: options?.context?.['dbName'] || 'test',
    type: 'sqlite',
    database: databaseFile,
    synchronize: false,
    migrations: migrations,
    migrationsRun: true,
    logging: false,
    entities: Entities,
    // allow shared tests to override connection options
    ...options?.context?.dbConnectionOptions,
  }).initialize()

  agent = createAgent<
    IDIDManager &
      IKeyManager &
      IDataStore &
      IDataStoreORM &
      IResolver &
      IMessageHandler &
      IDIDComm &
      ICredentialPlugin &
      ICredentialIssuerLD
  >({
    ...options,
    context: {
      // authorizedDID: 'did:example:3456'
    },
    plugins: [
      new KeyManager({
        store: new KeyStore(dbConnection),
        kms: {
          local: new KeyManagementSystem(new PrivateKeyStore(dbConnection, new SecretBox(secretKey))),
        },
      }),
      new DIDManager({
        store: new DIDStore(dbConnection),
        defaultProvider: 'did:peer',
        providers: {
          'did:peer': new PeerDIDProvider({
            defaultKms: 'local'
          }),
        },
      }),
      new DIDResolverPlugin({
        ...getDidPeerResolver(),
      }),
      new DataStore(dbConnection),
      new DataStoreORM(dbConnection),
      new MessageHandler({
        messageHandlers: [
          new DIDCommMessageHandler(),
          new JwtMessageHandler(),
          new W3cMessageHandler(),
          new StarchatQuestionMessageHandler()
        ],
      }),
      new DIDComm([new DIDCommHttpTransport()]),
      new CredentialPlugin(),
      new CredentialIssuerLD({
        contextMaps: [LdDefaultContexts, credential_contexts as any],
        suites: [new VeramoEcdsaSecp256k1RecoverySignature2020(), new VeramoEd25519Signature2018()],
      }),
      ...(options?.plugins || []),
    ],
  })
  return true
}

const tearDown = async (): Promise<boolean> => {
  try {
    await (await dbConnection).dropDatabase()
    await (await dbConnection).close()
  } catch (e) {
    // nop
  }
  try {
    fs.unlinkSync(databaseFile)
  } catch (e) {
    // nop
  }
  return true
}

const getAgent = () => agent

const testContext = { getAgent, setup, tearDown }

describe('Local integration tests', () => {
  myPluginLogic(testContext)
})
