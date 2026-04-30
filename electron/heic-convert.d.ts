declare module 'heic-convert' {
  type OutputFormat = 'JPEG' | 'PNG'

  interface ConvertOptions {
    buffer: Buffer
    format: OutputFormat
    quality?: number
  }

  function convert(options: ConvertOptions): Promise<ArrayBuffer | Buffer | Uint8Array>

  export default convert
}
