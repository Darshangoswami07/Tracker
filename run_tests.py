import sys
sys.path.insert(0, r'D:\DeliveryHub\backend')
import subprocess
result = subprocess.run(['python', '-m', 'pytest', 'tests/test_auth.py', '-x', '-v'], capture_output=True, text=True, cwd=r'D:\DeliveryHub\backend')
print('STDOUT:', result.stdout)
print('STDERR:', result.stderr)
print('Return code:', result.returncode)