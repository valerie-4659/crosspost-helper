import subprocess, os, sys

os.chdir('/Users/sascha.fuchs/develop/tools/crossposthelper')

r1 = subprocess.run(['git', 'add', '-A'], capture_output=True, text=True)
r2 = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
r3 = subprocess.run(['git', 'commit', '-m', 'feat: writing personas + X Premium+ + story narratives (wip)'], capture_output=True, text=True)

out = open('git_out.txt', 'w')
out.write('ADD:\n' + r1.stdout + r1.stderr + '\n')
out.write('STATUS:\n' + r2.stdout + '\n')
out.write('COMMIT:\n' + r3.stdout + r3.stderr + '\n')
out.write('EXIT: ' + str(r3.returncode) + '\n')
out.close()
print('done')
