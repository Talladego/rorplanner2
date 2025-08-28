import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client'

const httpLink = createHttpLink({
  uri: 'https://production-api.waremu.com/graphql',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

export const apolloClient = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
})
