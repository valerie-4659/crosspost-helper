#!/bin/bash
cd /Users/sascha.fuchs/develop/tools/crossposthelper
git add -A
git status --short
git commit -m "feat: writing personas + X Premium+ + story narratives"
echo "COMMIT_DONE:$?"
