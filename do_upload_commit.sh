#!/bin/bash
set -e
cd /Users/sascha.fuchs/develop/tools/crossposthelper
git add -A
git commit -F cph_upload_commit.txt
rm -f cph_upload_commit.txt
git log --format="%h %s" -1
echo "COMMIT_DONE"
