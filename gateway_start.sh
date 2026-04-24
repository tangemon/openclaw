#!/usr/bin/bash

export no_proxy="artsz.zte.com.cn,localhost,127.0.0.1"

pnpm openclaw gateway stop
pnpm openclaw gateway --port 18789 --verbose
