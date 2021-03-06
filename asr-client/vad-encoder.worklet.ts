const FRAME_SIZE = 480;
const OPUS_PACKET_MAX_SIZE = 1275 * 3 + 7;
const OPUS_APPLICATION_VOIP = 2048;
const OPUS_GET_LOOKAHEAD_REQUEST = 4027;
const TARGET_SAMPLING_RATE = 48000;

class VadAndEncodeProcessor extends AudioWorkletProcessor {
  private sampleRate: number;
  private packetDuration: number;
  private wasm: WasmExports | undefined;
  private dsp_handle = 0;
  private dsp_in: Float32Array = new Float32Array();
  private dsp_in_ptr = 0;
  private dsp_in_filled = 0;
  private dsp_out: Float32Array = new Float32Array();
  private dsp_out_ptr = 0;
  private dsp_in_ret: Uint32Array = new Uint32Array();
  private dsp_in_ret_ptr = 0;
  private dsp_out_ret: Uint32Array = new Uint32Array();
  private dsp_out_ret_ptr = 0;
  private opus_handle = 0;
  private opus_buf: Float32Array = new Float32Array(0);
  private opus_buf_ptr = 0;
  private opus_buf_filled = 0;
  private opus_packet = 0;
  private adjust_size = (x: number): number => 2 ** Math.ceil(Math.log2(x));

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const opts = options?.processorOptions;
    const module = opts.module as WebAssembly.Module;
    this.sampleRate = opts.sampleRate as number;
    this.packetDuration = FRAME_SIZE / this.sampleRate;

    WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: {
        proc_exit: (): void => {},
        fd_close: () => 0,
        fd_seek: () => {},
        fd_write: () => 0,
      },
    }).then(
      (instance) => {
        this.wasm = (instance.exports as unknown) as WasmExports;
        const err = this.wasm.malloc(4);
        if (this.sampleRate !== TARGET_SAMPLING_RATE) {
          this.dsp_handle = this.wasm.speex_resampler_init(
            1,
            this.sampleRate,
            TARGET_SAMPLING_RATE,
            5,
            err
          );
          this.dsp_in_ret_ptr = this.wasm.malloc(4);
          this.dsp_in_ret = new Uint32Array(this.wasm.memory.buffer, this.dsp_in_ret_ptr, 1);
          this.dsp_out_ret_ptr = this.wasm.malloc(4);
          this.dsp_out_ret = new Uint32Array(this.wasm.memory.buffer, this.dsp_out_ret_ptr, 1);
        }
        this.opus_buf_ptr = this.wasm.malloc(FRAME_SIZE * 4);
        this.opus_buf = new Float32Array(this.wasm.memory.buffer, this.opus_buf_ptr, FRAME_SIZE);
        this.opus_packet = this.wasm.malloc(OPUS_PACKET_MAX_SIZE);
        this.opus_handle = this.wasm.opus_encoder_create(
          TARGET_SAMPLING_RATE,
          1,
          OPUS_APPLICATION_VOIP,
          err
        );
        let preskip = 0;
        if (this.wasm.opus_encoder_ctl1(this.opus_handle, OPUS_GET_LOOKAHEAD_REQUEST, err) === 0)
          [preskip] = new Uint32Array(this.wasm.memory.buffer, err, 1);
        this.wasm.free(err);
        this.port.postMessage({
          input_sample_rate: this.sampleRate,
          pre_skip: preskip,
          version: this.get_opus_version_string().replace('-dirt', ''),
        });
      },
      (e) => {
        this.port.postMessage({
          error: e.toString(),
          detail: e,
        });
      }
    );
  }

  process(inputs: Float32Array[][]): boolean {
    if (inputs.length !== 1 || inputs[0].length === 0 || this.wasm === undefined) return true;
    let X = inputs[0][0];
    if (this.dsp_handle !== 0) {
      if (this.dsp_in.length < this.dsp_in_filled + X.length) {
        const tmpLen = this.adjust_size(this.dsp_in_filled + X.length);
        const tmpPtr = this.wasm.malloc(4 * tmpLen);
        const tmp = new Float32Array(this.wasm.memory.buffer, tmpPtr, tmpLen);
        tmp.set(this.dsp_in.subarray(0, this.dsp_in_filled), 0);
        if (this.dsp_in_ptr !== 0) this.wasm.free(this.dsp_in_ptr);
        this.dsp_in_ptr = tmpPtr;
        this.dsp_in = tmp;
      }
      this.dsp_in.set(X, this.dsp_in_filled);
      this.dsp_in_filled += X.length;
      this.dsp_in_ret[0] = this.dsp_in_filled;
      const maxOutLength = this.adjust_size(
        this.dsp_in_filled * (TARGET_SAMPLING_RATE / this.sampleRate)
      );
      if (this.dsp_out.length < maxOutLength) {
        if (this.dsp_out_ptr !== 0) this.wasm.free(this.dsp_out_ptr);
        this.dsp_out_ptr = this.wasm.malloc(maxOutLength * 4);
        this.dsp_out = new Float32Array(this.wasm.memory.buffer, this.dsp_out_ptr, maxOutLength);
      }
      this.dsp_out_ret[0] = this.dsp_out.length;
      this.wasm.speex_resampler_process_interleaved_float(
        this.dsp_handle,
        this.dsp_in_ptr,
        this.dsp_in_ret_ptr,
        this.dsp_out_ptr,
        this.dsp_out_ret_ptr
      );
      this.dsp_in_filled -= this.dsp_in_ret[0];
      X = this.dsp_out.subarray(0, this.dsp_out_ret[0]);
    }

    while (X.length > 0) {
      const sz = Math.min(FRAME_SIZE - this.opus_buf_filled, X.length);
      this.opus_buf.set(X.subarray(0, sz), this.opus_buf_filled);
      this.opus_buf_filled += sz;
      X = X.subarray(sz);
      if (this.opus_buf_filled < FRAME_SIZE) break;

      const packetSize = this.wasm.opus_encode_float(
        this.opus_handle,
        this.opus_buf_ptr,
        FRAME_SIZE,
        this.opus_packet,
        OPUS_PACKET_MAX_SIZE
      );
      const packet = this.wasm.memory.buffer.slice(this.opus_packet, this.opus_packet + packetSize);
      const msg: IPacketMessage = {
        opus_vad: this.wasm.opus_get_last_vad_prob(),
        packet,
        duration: this.packetDuration,
      };
      this.port.postMessage(msg, [packet]);
      this.opus_buf_filled = 0;
    }
    return true;
  }

  get_opus_version_string(): string {
    if (!this.wasm) return '';
    const u8 = new Uint8Array(this.wasm.memory.buffer, this.wasm.opus_get_version_string());
    let len = 0;
    for (; len < 1024; len += 1) {
      if (u8[len] === 0) {
        len -= 1;
        break;
      }
    }
    return String.fromCharCode(...u8.subarray(0, len));
  }
}

interface WasmExports {
  malloc(sz: number): number;
  free(ptr: number): void;
  memory: WebAssembly.Memory;

  opus_get_version_string(): number;
  opus_encoder_create(fs: number, ch: number, app: number, err_ptr: number): number;
  opus_encode_float(
    handle: number,
    buf: number,
    size: number,
    packet: number,
    max_size: number
  ): number;
  opus_encoder_ctl0(handle: number, request: number, value: number): number;
  opus_encoder_ctl1(handle: number, request: number, ptr: number): number;
  opus_get_last_vad_prob(): number;

  speex_resampler_init(
    nb_channels: number,
    in_rate: number,
    out_rate: number,
    quality: number,
    err_ptr: number
  ): number;
  speex_resampler_process_interleaved_float(
    handle: number,
    in_ptr: number,
    in_len_ptr: number,
    out_ptr: number,
    out_len_ptr: number
  ): number;
}

export interface IPacketMessage {
  opus_vad: number;
  packet: ArrayBuffer;
  duration: number;
}

registerProcessor('vad-encoder', VadAndEncodeProcessor);
