#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_root}"

if [[ -n "${POSTGRES_BIN_DIR:-}" ]]; then
  postgres_bin="${POSTGRES_BIN_DIR}"
elif command -v pg_config >/dev/null 2>&1; then
  postgres_bin="$(pg_config --bindir)"
elif [[ -x /opt/homebrew/opt/postgresql@17/bin/initdb ]]; then
  postgres_bin="/opt/homebrew/opt/postgresql@17/bin"
else
  printf 'Set POSTGRES_BIN_DIR to the directory containing initdb and pg_ctl.\n' >&2
  exit 1
fi

for required_tool in initdb pg_ctl createdb; do
  if [[ ! -x "${postgres_bin}/${required_tool}" ]]; then
    printf 'PostgreSQL tool not found: %s/%s\n' "${postgres_bin}" "${required_tool}" >&2
    exit 1
  fi
done

test_directory="$(mktemp -d /tmp/dance-course-pg-test.XXXXXX)"
test_data_directory="${test_directory}/data"

cleanup() {
  local result=$?
  if [[ -f "${test_data_directory}/postmaster.pid" ]]; then
    if ! "${postgres_bin}/pg_ctl" -D "${test_data_directory}" -m fast -w stop >/dev/null 2>&1; then
      printf 'Could not stop temporary PostgreSQL; files retained at %s\n' "${test_directory}" >&2
      exit 1
    fi
  fi
  rm -rf -- "${test_directory}"
  exit "${result}"
}

trap cleanup EXIT

test_port="$(node --input-type=module -e '
  import { createServer } from "node:net";
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  process.stdout.write(String(port));
')"

if ! "${postgres_bin}/initdb" -D "${test_data_directory}" -U postgres \
  --auth-local=trust --auth-host=trust --encoding=UTF8 --locale=C \
  >"${test_directory}/initdb.log" 2>&1; then
  cat "${test_directory}/initdb.log" >&2
  exit 1
fi

if ! "${postgres_bin}/pg_ctl" -D "${test_data_directory}" \
  -l "${test_directory}/server.log" \
  -o "-h 127.0.0.1 -p ${test_port} -k ${test_directory}" -w start \
  >"${test_directory}/startup.log" 2>&1; then
  cat "${test_directory}/startup.log" >&2
  if [[ -f "${test_directory}/server.log" ]]; then
    cat "${test_directory}/server.log" >&2
  fi
  exit 1
fi

"${postgres_bin}/createdb" -h 127.0.0.1 -p "${test_port}" -U postgres dance_course_test
export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:${test_port}/dance_course_test"

printf 'Applying migrations to a fresh temporary PostgreSQL database.\n'
node --import tsx tests/integration/setup-test-database.ts

if [[ $# -gt 0 ]]; then
  node --import tsx --test "$@"
else
  npm run test:integration
fi
