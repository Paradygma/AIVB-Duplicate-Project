import { duplicateProject } from '../services/duplicateProject'

export async function runDuplicateProject(pageId: string) {
  return duplicateProject(pageId)
}
