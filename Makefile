OUTPUT_DIR=./build
EMCC_OPTS=-O3 --memory-init-file 0 --closure 1 -s NO_FILESYSTEM=1 -s MODULARIZE=1
EXPORTS:='_free','_malloc','_opus_strerror','_opus_get_version_string','_opus_encoder_get_size','_opus_encoder_init','_opus_encode','_opus_encode_float','_opus_encoder_ctl','_opus_decoder_get_size','_opus_decoder_init','_opus_decode','_opus_decode_float','_opus_decoder_ctl','_opus_packet_get_nb_samples'

LIBOPUS_STABLE=tags/v1.1.2
LIBOPUS_DIR=./opus
LIBOPUS_OBJ=$(LIBOPUS_DIR)/.libs/libopus.a

POST_JS=./lib/post.js
LIBOPUS_JS=$(OUTPUT_DIR)/libopus.js

default: $(LIBOPUS_JS)

clean:
	rm -rf $(OUTPUT_DIR) $(LIBOPUS_DIR)
	mkdir $(OUTPUT_DIR)

.PHONY: clean default

$(LIBOPUS_DIR):
	git submodule update --init --recursive
	cd $(LIBOPUS_DIR); git checkout ${LIBOPUS_STABLE}

$(LIBOPUS_OBJ): $(LIBOPUS_DIR)
	cd $(LIBOPUS_DIR); ./autogen.sh
	cd $(LIBOPUS_DIR); emconfigure ./configure --disable-extra-programs --disable-doc
	cd $(LIBOPUS_DIR); emmake make

$(LIBOPUS_JS): $(LIBOPUS_OBJ) $(POST_JS)
	emcc -o $@ $(EMCC_OPTS) -s EXPORTED_FUNCTIONS="[$(EXPORTS)]" $(LIBOPUS_OBJ)
	cat $(POST_JS) >> $(LIBOPUS_JS)
	# So, there is a bug in static-module (used by brfs) which causes it to fail
	# when trying to parse our generated output for the require('fs') calls
	# Because we won't be using the file system anyway, we monkey patch that call
	sed -i'' 's/require("fs")/null/g' $(LIBOPUS_JS)
