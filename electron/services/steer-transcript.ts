import { readFile, stat } from 'fs/promises'
import { basename, extname } from 'path'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { FollowUpRecord } from './turn-control-store'
import type { PendingSteer, TurnRuntime } from './turn-runtime'
import type { TurnInputItem } from './turn-control-types'

const MAX_LOCAL_IMAGE_BYTES = 100 * 1024 * 1024

const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

export interface SafeTurnInputMetadata {
  type: TurnInputItem['type']
  name?: string
  mimeType?: string
  sizeBytes?: number
  width?: number
  height?: number
}

export interface PreparedSteerInput {
  apiMessage: ChatCompletionMessageParam
  displayContent: string
  inputMetadata: SafeTurnInputMetadata[]
}

export interface LocalImageData {
  dataUrl: string
  mimeType: string
  sizeBytes: number
  name: string
}

export type LocalImageLoader = (
  item: Extract<TurnInputItem, { type: 'localImage' }>
) => Promise<LocalImageData>

export interface SteerDeliveryCommitInput extends PreparedSteerInput {
  steer: PendingSteer
}

export interface SteerDeliveryCommitResult {
  message: unknown
  followUp: FollowUpRecord
}

export interface SteerDeliveryDependencies {
  loadLocalImage?: LocalImageLoader
  commit(input: SteerDeliveryCommitInput): SteerDeliveryCommitResult
  reject(steer: PendingSteer, reason: string): void
  emit(input: SteerDeliveryCommitInput & SteerDeliveryCommitResult): void
}

export interface SteerBoundaryResult {
  delivered: number
  rejected: number
}

function safeImageMetadata(
  item: Extract<TurnInputItem, { type: 'image' | 'localImage' }>,
  fallbackName?: string,
  fallbackMimeType?: string,
  fallbackSize?: number
): SafeTurnInputMetadata {
  return {
    type: item.type,
    ...(item.name || fallbackName ? { name: item.name || fallbackName } : {}),
    ...(item.mimeType || fallbackMimeType ? { mimeType: item.mimeType || fallbackMimeType } : {}),
    ...((item.sizeBytes ?? fallbackSize) !== undefined
      ? { sizeBytes: item.sizeBytes ?? fallbackSize }
      : {}),
    ...(item.width !== undefined ? { width: item.width } : {}),
    ...(item.height !== undefined ? { height: item.height } : {})
  }
}

export async function loadLocalImage(
  item: Extract<TurnInputItem, { type: 'localImage' }>
): Promise<LocalImageData> {
  const info = await stat(item.path)
  if (!info.isFile()) throw new Error('localImage path is not a file')
  if (info.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new Error('localImage exceeds the 100 MB input limit')
  }
  const inferredMimeType = IMAGE_MIME_BY_EXTENSION[extname(item.path).toLowerCase()]
  const mimeType = item.mimeType ?? inferredMimeType
  if (!mimeType?.startsWith('image/')) {
    throw new Error('localImage requires an image MIME type or recognized image extension')
  }
  const bytes = await readFile(item.path)
  return {
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    mimeType,
    sizeBytes: bytes.byteLength,
    name: item.name ?? basename(item.path)
  }
}

export async function prepareSteerInput(
  items: TurnInputItem[],
  localImageLoader: LocalImageLoader = loadLocalImage
): Promise<PreparedSteerInput> {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }
  > = []
  const displayParts: string[] = []
  const inputMetadata: SafeTurnInputMetadata[] = []

  for (const item of items) {
    if (item.type === 'text') {
      content.push({ type: 'text', text: item.text })
      displayParts.push(item.text)
      inputMetadata.push({ type: 'text' })
      continue
    }
    if (item.type === 'image') {
      content.push({ type: 'image_url', image_url: { url: item.imageUrl, detail: 'auto' } })
      displayParts.push(`[Image: ${item.name ?? 'image'}]`)
      inputMetadata.push(safeImageMetadata(item))
      continue
    }

    const loaded = await localImageLoader(item)
    content.push({ type: 'image_url', image_url: { url: loaded.dataUrl, detail: 'auto' } })
    displayParts.push(`[Local image: ${item.name ?? loaded.name}]`)
    inputMetadata.push(safeImageMetadata(item, loaded.name, loaded.mimeType, loaded.sizeBytes))
  }

  return {
    apiMessage: { role: 'user', content } as ChatCompletionMessageParam,
    displayContent: displayParts.join('\n\n'),
    inputMetadata
  }
}

/**
 * Drain root-directed Steering at a safe model-dispatch boundary. The loop is
 * intentional: local-image loading yields to the event loop, so a second
 * Steer accepted during that load must join this same boundary rather than
 * missing the next dispatch.
 */
export async function deliverSteersAtBoundary(
  runtime: TurnRuntime,
  messages: ChatCompletionMessageParam[],
  deps: SteerDeliveryDependencies,
  targetAgentRunId: string | null
): Promise<SteerBoundaryResult> {
  const result: SteerBoundaryResult = { delivered: 0, rejected: 0 }
  while (runtime.status === 'running') {
    const batch = runtime.drainSteers(targetAgentRunId)
    if (batch.length === 0) break
    for (let index = 0; index < batch.length; index += 1) {
      const steer = batch[index]
      let prepared: PreparedSteerInput
      try {
        prepared = await prepareSteerInput(steer.input, deps.loadLocalImage)
      } catch (err) {
        try {
          deps.reject(steer, err instanceof Error ? err.message : 'Steer input preparation failed')
        } catch (rejectError) {
          runtime.restoreSteers(batch.slice(index))
          throw rejectError
        }
        result.rejected += 1
        continue
      }

      try {
        const committed = deps.commit({ steer, ...prepared })
        messages.push(prepared.apiMessage)
        result.delivered += 1
        // Persistence is the delivery commit point. A renderer disappearing
        // between the commit and its notification must not rewrite a durable
        // delivered row as rejected or duplicate the API transcript entry.
        try {
          deps.emit({ steer, ...prepared, ...committed })
        } catch {
          // The renderer reload/reconnect path reads the durable message and
          // follow-up state. Event delivery is deliberately best-effort here.
        }
      } catch (err) {
        try {
          deps.reject(steer, err instanceof Error ? err.message : 'Steer delivery failed')
        } catch (rejectError) {
          runtime.restoreSteers(batch.slice(index))
          throw rejectError
        }
        result.rejected += 1
      }
    }
  }
  return result
}

export function deliverRootSteersAtBoundary(
  runtime: TurnRuntime,
  messages: ChatCompletionMessageParam[],
  deps: SteerDeliveryDependencies
): Promise<SteerBoundaryResult> {
  return deliverSteersAtBoundary(runtime, messages, deps, null)
}

export function recoverUndeliveredSteers(
  runtime: TurnRuntime,
  recover: (steer: PendingSteer, reason: string) => void,
  reason: string
): number {
  const pending = runtime.drainAllSteers()
  let recovered = 0
  for (let index = 0; index < pending.length; index += 1) {
    const steer = pending[index]
    try {
      recover(steer, reason)
      recovered += 1
    } catch (err) {
      // Retain this and every not-yet-attempted item. Startup recovery can
      // settle the durable accepted rows if the process itself is failing.
      for (const retained of pending.slice(index)) runtime.enqueueSteer(retained)
      throw err
    }
  }
  return recovered
}
