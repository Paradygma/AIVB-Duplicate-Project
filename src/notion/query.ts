import type { Client } from '@notionhq/client'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { withRetry } from './retry'

export async function queryAllPages(
  notion: Client,
  databaseId: string,
  filter?: Parameters<Client['databases']['query']>[0]['filter'],
): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const response = await withRetry(() => notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 100,
      filter,
    }))
    pages.push(...response.results.filter((page): page is PageObjectResponse =>
      page.object === 'page' && 'properties' in page,
    ))
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined
  } while (cursor)

  return pages
}
