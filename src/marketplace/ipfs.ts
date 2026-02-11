export interface PinataConfig {
  apiKey: string
  secretKey: string
}

export interface IPFSUploadResult {
  success: boolean
  cid?: string
  error?: string
}

export interface IPFSFetchResult {
  success: boolean
  content?: string
  error?: string
}

const PINATA_API_URL = 'https://api.pinata.cloud'
const PINATA_GATEWAY = 'https://gateway.pinata.cloud/ipfs'

export async function uploadToIPFS(
  content: string,
  filename: string,
  config: PinataConfig
): Promise<IPFSUploadResult> {
  try {
    const blob = new Blob([content], { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', blob, filename)

    const metadata = JSON.stringify({
      name: filename,
      keyvalues: {
        type: 'bouno-skill',
        timestamp: Date.now().toString(),
      },
    })
    formData.append('pinataMetadata', metadata)

    const options = JSON.stringify({
      cidVersion: 1,
    })
    formData.append('pinataOptions', options)

    const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
      method: 'POST',
      headers: {
        pinata_api_key: config.apiKey,
        pinata_secret_api_key: config.secretKey,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `Upload failed: ${error}` }
    }

    const result = await response.json()

    // Validate response structure
    if (!result || typeof result.IpfsHash !== 'string' || result.IpfsHash.length === 0) {
      return { success: false, error: 'Invalid response from Pinata: missing IpfsHash' }
    }

    return { success: true, cid: result.IpfsHash }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function uploadJSONToIPFS(
  data: Record<string, unknown>,
  name: string,
  config: PinataConfig
): Promise<IPFSUploadResult> {
  try {
    const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: config.apiKey,
        pinata_secret_api_key: config.secretKey,
      },
      body: JSON.stringify({
        pinataContent: data,
        pinataMetadata: {
          name,
          keyvalues: {
            type: 'bouno-skill-metadata',
            timestamp: Date.now().toString(),
          },
        },
        pinataOptions: {
          cidVersion: 1,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return { success: false, error: `Upload failed: ${error}` }
    }

    const result = await response.json()

    // Validate response structure
    if (!result || typeof result.IpfsHash !== 'string' || result.IpfsHash.length === 0) {
      return { success: false, error: 'Invalid response from Pinata: missing IpfsHash' }
    }

    return { success: true, cid: result.IpfsHash }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function fetchFromIPFS(cid: string): Promise<IPFSFetchResult> {
  try {
    // Try multiple gateways for reliability
    const gateways = [
      PINATA_GATEWAY,
      'https://ipfs.io/ipfs',
      'https://cloudflare-ipfs.com/ipfs',
      'https://dweb.link/ipfs',
    ]

    for (const gateway of gateways) {
      try {
        const response = await fetch(`${gateway}/${cid}`, {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        })

        if (response.ok) {
          const content = await response.text()
          return { success: true, content }
        }
      } catch {
        // Try next gateway
        continue
      }
    }

    return { success: false, error: 'Failed to fetch from all gateways' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export function getIPFSUrl(cid: string): string {
  return `${PINATA_GATEWAY}/${cid}`
}

export function cidToIpfsUri(cid: string): string {
  return `ipfs://${cid}`
}

export function ipfsUriToCid(uri: string): string | null {
  if (uri.startsWith('ipfs://')) {
    return uri.slice(7)
  }
  return null
}
