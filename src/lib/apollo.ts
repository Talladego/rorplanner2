import { ApolloClient, InMemoryCache } from '@apollo/client'

export const apolloClient = new ApolloClient({
  uri: 'https://production-api.waremu.com/graphql/',
  cache: new InMemoryCache(),
})
