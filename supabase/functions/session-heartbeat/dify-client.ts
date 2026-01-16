import { uploadImageToDify as sharedUpload } from '../_shared/difyUpload.ts'
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts'
import type { DifyRunInputs } from './types.ts'

export interface DifyDeps {
  difyApiUrl: string
  difyApiKey: string
}

export interface UploadResult {
  cameraFileId?: string
  screenFileId?: string
}

export async function uploadImages(
  {
    cameraImage,
    screenImage,
    userId
  }: { cameraImage?: string; screenImage?: string; userId: string },
  deps: DifyDeps
): Promise<UploadResult> {
  const results = await Promise.all([
    cameraImage ? sharedUpload(cameraImage, { difyApiUrl: deps.difyApiUrl, difyApiKey: deps.difyApiKey, userId, imageType: 'camera' }) : Promise.resolve(null),
    screenImage ? sharedUpload(screenImage, { difyApiUrl: deps.difyApiUrl, difyApiKey: deps.difyApiKey, userId, imageType: 'screen' }) : Promise.resolve(null)
  ])
  const [cam, scr] = results
  return { cameraFileId: cam?.id, screenFileId: scr?.id }
}

export function buildWorkflowInputs(
  {
    goal_text,
    task_list,
    cameraFileId,
    screenFileId,
    falseDetect
  }: { goal_text: string; task_list: string; cameraFileId?: string; screenFileId?: string; falseDetect?: string }
): DifyRunInputs {
  const inputs: DifyRunInputs = { goal_text, task_list }
  inputs.false_detect = falseDetect ?? ''

  // Camera image (unchanged)
  if (cameraFileId) {
    inputs.user_video_image = { transfer_method: 'local_file', upload_file_id: cameraFileId, type: 'image' }
  }

  // screenshot_image: ONLY current screenshot (单张图片用于分心检测)
  if (screenFileId) {
    inputs.screenshot_image = { transfer_method: 'local_file', upload_file_id: screenFileId, type: 'image' }
    console.log('[dify-client] sending_current_screenshot', {
      screenshot_image: screenFileId.substring(0, 10)
    })
  }

  // 不再发送 previous_screenshot_image，只发送当前截图

  return inputs
}

export async function runWorkflow(inputs: DifyRunInputs, userId: string, deps: DifyDeps): Promise<Response> {
  const url = `${deps.difyApiUrl}/v1/workflows/run`
  const res = await fetchWithTimeout(url, {
    timeoutMs: 30000,
    init: {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deps.difyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs, response_mode: 'blocking', user: `user_${userId}` })
    }
  })
  return res
}

