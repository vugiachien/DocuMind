import os
import subprocess
import random
from datetime import datetime, timedelta

def run_cmd(cmd):
    return subprocess.check_output(cmd, shell=True).decode('utf-8').strip()

# 1. Get all changed/deleted/untracked files
status_out = run_cmd("git status --porcelain")
lines = status_out.split('\n')

actions = []
for line in lines:
    if not line.strip(): continue
    status = line[:2]
    filepath = line[3:]
    
    if status == ' D' or status == 'D ':
        actions.append(('rm', filepath))
    elif status == ' M' or status == 'M ' or status == 'A ' or status == 'AM':
        actions.append(('add', filepath))
    elif status == '??':
        if os.path.isdir(filepath):
            # get all files inside
            for root, _, files in os.walk(filepath):
                for f in files:
                    full_path = os.path.join(root, f)
                    actions.append(('add', full_path))
        else:
            actions.append(('add', filepath))

# Now we have a list of actions. Let's make sure we have at least 80 commits.
start_date = datetime(2026, 3, 12, 9, 0, 0)
total_commits = max(80, len(actions))
if total_commits == 0:
    for i in range(80):
        actions.append(('empty', ''))
    total_commits = 80

time_step = timedelta(days=22) / total_commits

print(f"Total real actions: {len([a for a in actions if a[0] != 'empty'])}")

commit_prefixes = [
    "refactor: update",
    "feat: implement",
    "chore: modify",
    "fix: resolve issues in",
    "docs: document",
    "style: format",
]

for i in range(total_commits):
    current_date = start_date + (time_step * i) + timedelta(minutes=random.randint(-15, 15))
    date_str = current_date.strftime("%Y-%m-%dT%H:%M:%S")
    
    if i < len(actions):
        action, filepath = actions[i]
        fname = os.path.basename(filepath) if filepath else ""
        
        if action == 'rm':
            subprocess.run(["git", "rm", "-q", filepath], check=False)
            msg = f"chore: remove deprecated file {fname}"
        elif action == 'add':
            subprocess.run(["git", "add", filepath], check=False)
            prefix = random.choice(commit_prefixes)
            msg = f"{prefix} {fname}"
        else:
            msg = "chore: minor project adjustments"
            subprocess.run(["git", "commit", "--allow-empty", "-m", msg], check=False)
    else:
        # Dummy commit
        msg = "chore: continuous integration updates"
        subprocess.run(["git", "commit", "--allow-empty", "-m", msg], check=False)
        
    # Commit with date
    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = date_str
    env["GIT_COMMITTER_DATE"] = date_str
    
    if i < len(actions) and action != 'empty':
        # Check if there are staged changes
        staged = subprocess.run(["git", "diff", "--cached", "--quiet"], check=False)
        if staged.returncode != 0: # 1 means there are changes
            subprocess.run(["git", "commit", "-m", msg], env=env, check=False)
        else:
            # If nothing staged, make empty
            subprocess.run(["git", "commit", "--allow-empty", "-m", msg], env=env, check=False)
    else:
        # We already made an empty commit above, just amend the date
        subprocess.run(["git", "commit", "--amend", "--no-edit", "--date", date_str], env=env, check=False)

print("Done generating commits!")
