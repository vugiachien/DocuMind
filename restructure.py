import os
import shutil
import re

APP_DIR = 'backend/app'
MODULES_DIR = os.path.join(APP_DIR, 'modules')

# Define target modules
modules = ['agreements', 'audit_policies', 'users', 'departments', 'notifications']

# Create module directories
for mod in modules:
    os.makedirs(os.path.join(MODULES_DIR, mod), exist_ok=True)
    open(os.path.join(MODULES_DIR, mod, '__init__.py'), 'a').close()

# Mapping of file moves: (source_path, dest_path, import_old, import_new)
moves = [
    # Agreements
    ('api/endpoints/agreements.py', 'modules/agreements/router.py', r'app\.api\.endpoints\.agreements', 'app.modules.agreements.router'),
    ('services/agreement_service.py', 'modules/agreements/service.py', r'app\.services\.agreement_service', 'app.modules.agreements.service'),
    ('schemas/agreement.py', 'modules/agreements/schemas.py', r'app\.schemas\.agreement', 'app.modules.agreements.schemas'),
    ('services/agreement_modifier.py', 'modules/agreements/modifier.py', r'app\.services\.agreement_modifier', 'app.modules.agreements.modifier'),
    
    # Audit Policies (Playbooks)
    ('api/endpoints/audit_policies.py', 'modules/audit_policies/router.py', r'app\.api\.endpoints\.audit_policies', 'app.modules.audit_policies.router'),
    ('schemas/audit_policy.py', 'modules/audit_policies/schemas.py', r'app\.schemas\.audit_policy', 'app.modules.audit_policies.schemas'),
    ('services/audit_policy_extractor.py', 'modules/audit_policies/extractor.py', r'app\.services\.audit_policy_extractor', 'app.modules.audit_policies.extractor'),
    
    # Users & Auth
    ('api/endpoints/users.py', 'modules/users/router.py', r'app\.api\.endpoints\.users', 'app.modules.users.router'),
    ('schemas/user.py', 'modules/users/schemas.py', r'app\.schemas\.user', 'app.modules.users.schemas'),
    ('api/endpoints/auth.py', 'modules/users/auth_router.py', r'app\.api\.endpoints\.auth', 'app.modules.users.auth_router'),
    ('schemas/token.py', 'modules/users/token_schema.py', r'app\.schemas\.token', 'app.modules.users.token_schema'),
    
    # Departments
    ('api/endpoints/departments.py', 'modules/departments/router.py', r'app\.api\.endpoints\.departments', 'app.modules.departments.router'),
    ('schemas/department.py', 'modules/departments/schemas.py', r'app\.schemas\.department', 'app.modules.departments.schemas'),
    
    # Notifications
    ('api/endpoints/notifications.py', 'modules/notifications/router.py', r'app\.api\.endpoints\.notifications', 'app.modules.notifications.router'),
    ('services/notification_service.py', 'modules/notifications/service.py', r'app\.services\.notification_service', 'app.modules.notifications.service'),
    ('schemas/notification.py', 'modules/notifications/schemas.py', r'app\.schemas\.notification', 'app.modules.notifications.schemas'),
]

# Perform file moves
for src, dest, _, _ in moves:
    src_full = os.path.join(APP_DIR, src)
    dest_full = os.path.join(APP_DIR, dest)
    if os.path.exists(src_full):
        shutil.move(src_full, dest_full)
        print(f"Moved {src} -> {dest}")
    else:
        print(f"Skipping (not found): {src}")

# Fix imports across all Python files in the application
def fix_imports():
    for root, dirs, files in os.walk(APP_DIR):
        if '__pycache__' in root:
            continue
        for file in files:
            if not file.endswith('.py'):
                continue
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = content
            for _, _, old_imp, new_imp in moves:
                # Replace standard `from app.x.y import ...`
                new_content = re.sub(old_imp, new_imp, new_content)
                # Replace `import app.x.y` and usage
                old_imp_dot = old_imp.replace(r'\.', '.')
                if old_imp_dot in new_content:
                    new_content = new_content.replace(old_imp_dot, new_imp)
            
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed imports in: {filepath}")

fix_imports()
