import type { TaskParams } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { normalizeImageSize } from './size'

export const MANAGED_OUTPUT_IMAGE_LIMIT = 1
export const MANAGED_REQUEST_TIMEOUT_SECONDS = 300

export function normalizeManagedGatewayParams(params: TaskParams): TaskParams {
  const nextParams: TaskParams = {
    ...params,
    size: normalizeImageSize(params.size) || DEFAULT_PARAMS.size,
    n: MANAGED_OUTPUT_IMAGE_LIMIT,
  }

  if (nextParams.output_format === 'png') {
    nextParams.output_compression = DEFAULT_PARAMS.output_compression
  }

  return nextParams
}
