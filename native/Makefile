TARGET:=../asr-client/opus.wasm
all: $(TARGET)

clean:
	rm -f $(TARGET); \
	cd opus; \
	rm -rf *; git reset --hard; \
	cd ../speexdsp ; \
	rm -rf *; git reset --hard

# build script from https://github.com/kazuki/mediacodec.wasm
$(TARGET): clean
	cd opus; \
	cat ../opus.hack.patch | patch -p1; \
	./autogen.sh && \
	emconfigure ./configure --disable-extra-programs --disable-doc --disable-asm --disable-rtcd --disable-intrinsics --disable-stack-protector && \
	emmake make -j4 && \
	cd ../speexdsp ; \
	./autogen.sh && \
	emconfigure ./configure --disable-examples --disable-neon && \
	emmake make -j4 && \
	cd ..; \
	emcc -o $@ -O2 -s FILESYSTEM=0 -s INITIAL_MEMORY=134217728 --no-entry \
		-s EXPORTED_FUNCTIONS="['_opus_get_version_string','_opus_encoder_create','_opus_encode_float','_opus_encoder_ctl','_opus_encoder_ctl0','_opus_encoder_ctl1','_opus_encoder_destroy','_opus_get_last_vad_prob','_speex_resampler_init','_speex_resampler_destroy','_speex_resampler_process_interleaved_float']" \
		opus/.libs/libopus.a speexdsp/libspeexdsp/.libs/libspeexdsp.a
