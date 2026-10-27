#!/bin/bash
# Helper behind the fixture's fake skills: fake.sh <verb> [args]. Logic lives in fake.py beside this file.
exec /usr/bin/python3 "$(cd "$(dirname "$0")" && pwd)/fake.py" "$@"
