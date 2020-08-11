/// <reference path="./audioworklet.d.ts" />

const FRAME_SIZE = 480;
const OPUS_PACKET_MAX_SIZE = 1275 * 3 + 7;

class VadAndEncodeProcessor extends AudioWorkletProcessor {
  private wasm: WasmExports | undefined;
  private opus_handle: number = 0;
  private opus_buf: Float32Array = new Float32Array(0);
  private opus_buf_ptr: number = 0;
  private opus_buf_filled: number = 0;
  private opus_packet: number = 0;

  constructor(options: any) {
    super();
    const opts = options.processorOptions;
    const module = opts.module as WebAssembly.Module;

    WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: {
        proc_exit: (status_code: number): void => {},
        fd_close: (fd: number) => 0,
        fd_seek: (fd: number, offset: number, whence: number, newOffset: number) => {},
        fd_write: (fd: number, iov: number, iovcnt: number, p_written: number) => 0,
      },
    }).then((instance) => {
      this.wasm = (instance.exports as any) as WasmExports;
      this.opus_buf_ptr = this.wasm.malloc(FRAME_SIZE * 4);
      this.opus_buf = new Float32Array(this.wasm.memory.buffer, this.opus_buf_ptr, FRAME_SIZE);
      this.opus_packet = this.wasm.malloc(OPUS_PACKET_MAX_SIZE);
      const err = this.wasm.malloc(4);
      this.opus_handle = this.wasm.opus_encoder_create(48000, 1, 2048, err);
      this.wasm.free(err);
    }, e => {
      console.log(e);
    });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (inputs.length !== 1 || inputs[0].length === 0 || this.wasm === undefined)
      return true;
    let X = inputs[0][0];
    while (X.length > 0) {
      const sz = Math.min(FRAME_SIZE - this.opus_buf_filled, X.length);
      this.opus_buf.set(X.subarray(0, sz), this.opus_buf_filled);
      this.opus_buf_filled += sz;
      X = X.subarray(sz);
      if (this.opus_buf_filled === FRAME_SIZE) {
        this.process_frame();
        this.opus_buf_filled = 0;
      }
    }
    return true;
  }

  private process_frame(): void {
    if (!this.wasm) return;
    const packet_size = this.wasm.opus_encode_float(
      this.opus_handle, this.opus_buf_ptr, FRAME_SIZE, this.opus_packet, OPUS_PACKET_MAX_SIZE);
    this.port.postMessage({
      opus_vad: this.wasm.opus_get_last_vad_prob(),
    });
  }
}

interface WasmExports {
  malloc(sz: number): number;
  free(ptr: number): void;
  memory: WebAssembly.Memory;

  opus_encoder_create(fs: number, ch: number, app: number, err_ptr: number): number;
  opus_encode_float(handle: number, buf: number, size: number, packet: number, max_size: number): number;
  opus_get_last_vad_prob(): number;
}

registerProcessor('vad-encoder', VadAndEncodeProcessor);
