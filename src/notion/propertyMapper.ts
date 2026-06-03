import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

type Property = PageObjectResponse['properties'][string]
type WritableProperties = Record<string, unknown>

const OMITTED_TYPES = new Set([
  'button',
  'created_by',
  'created_time',
  'formula',
  'last_edited_by',
  'last_edited_time',
  'rollup',
  'unique_id',
  'verification',
])

export function writableProperties(
  properties: PageObjectResponse['properties'],
  omittedNames: Set<string> = new Set(),
): WritableProperties {
  return Object.fromEntries(Object.entries(properties).flatMap(([name, property]) => {
    if (omittedNames.has(name) || OMITTED_TYPES.has(property.type)) return []
    const value = writableProperty(property)
    return value === undefined ? [] : [[name, value]]
  }))
}

function writableProperty(property: Property): unknown {
  switch (property.type) {
    case 'title': return { title: property.title }
    case 'rich_text': return { rich_text: property.rich_text }
    case 'number': return { number: property.number }
    case 'select': return { select: property.select }
    case 'multi_select': return { multi_select: property.multi_select }
    case 'status': return { status: property.status }
    case 'date': return { date: property.date }
    case 'checkbox': return { checkbox: property.checkbox }
    case 'url': return { url: property.url }
    case 'email': return { email: property.email }
    case 'phone_number': return { phone_number: property.phone_number }
    case 'people': return { people: property.people.map(({ id }) => ({ id })) }
    case 'relation': return { relation: property.relation.map(({ id }) => ({ id })) }
    default: return undefined
  }
}

export function remapRelations(
  relations: Array<{ id: string }>,
  idMap: Map<string, string>,
): Array<{ id: string }> {
  return relations.flatMap(({ id }) => {
    const mappedId = idMap.get(id)
    return mappedId ? [{ id: mappedId }] : []
  })
}
