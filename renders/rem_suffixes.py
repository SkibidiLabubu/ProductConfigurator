import os
import re

# Matches: name.ext0001.ext  → name.ext
PATTERN = re.compile(r"^(?P<base>.+?)\.(?P<ext>webp|png)\d+\.(?P=ext)$", re.IGNORECASE)

def main():
    root = os.getcwd()
    renamed = 0
    skipped = 0

    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            match = PATTERN.match(filename)
            if not match:
                continue

            base = match.group("base")
            ext = match.group("ext")
            new_name = f"{base}.{ext}"

            old_path = os.path.join(dirpath, filename)
            new_path = os.path.join(dirpath, new_name)

            if os.path.exists(new_path):
                print(f"SKIP (exists): {old_path} → {new_name}")
                skipped += 1
                continue

            os.rename(old_path, new_path)
            print(f"RENAME: {old_path} → {new_name}")
            renamed += 1

    print()
    print(f"Done. Renamed {renamed} file(s), skipped {skipped}.")

if __name__ == "__main__":
    main()
