#!/bin/bash

# Build script for zlib WebAssembly module

set -e
echo "Building zlib as WebAssembly module..."
if [ -f "emsdk/emsdk_env.sh" ]; then
    echo "Activating Emscripten from local emsdk..."
    export EMSDK_QUIET=1
    source emsdk/emsdk_env.sh
fi
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten activation failed. emcc command not found."
    echo "Try running: cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi
BUILD_DIR="dist-wasm"
if [ -d "$BUILD_DIR" ]; then
    echo "Cleaning existing build directory..."
    rm -rf "$BUILD_DIR"
fi
mkdir -p "$BUILD_DIR"
echo "Building with Emscripten..."
cd zlib
make -f ../Makefile.emscripten clean
make -f ../Makefile.emscripten wasm-module
cd ..
