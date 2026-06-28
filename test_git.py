import subprocess
import json

out = subprocess.check_output(['git', 'log', '-p', '--', 'frontend/app/(dashboard)/components/DashboardSidebar.tsx'], text=True)
print(out[:2000])
