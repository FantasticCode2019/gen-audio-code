#!/usr/bin/env bash
# 一键部署 Node.js + TypeScript 测试环境。
# 用法：bash setup-typescript.sh [项目目录]
# 可选环境变量：
#   NPM_USE_SUDO=1       仅在公司策略强制要求时，使用 sudo npm install；默认不用。
#   FORCE_NODE_INSTALL=1 即使检测到 Node.js/npm，也尝试通过系统包管理器重新安装。
#   FORCE_CONFIG=1       覆盖已有 tsconfig.json 与 src/index.ts 示例文件。

set -Eeuo pipefail
IFS=$'\n\t'

readonly MIN_NODE_MAJOR=18
readonly PROJECT_DIR="${1:-ts-playground}"
readonly NPM_USE_SUDO="${NPM_USE_SUDO:-0}"
readonly FORCE_NODE_INSTALL="${FORCE_NODE_INSTALL:-0}"
readonly FORCE_CONFIG="${FORCE_CONFIG:-0}"

COLOR_RED=$'\033[0;31m'
COLOR_GREEN=$'\033[0;32m'
COLOR_YELLOW=$'\033[0;33m'
COLOR_BLUE=$'\033[0;34m'
COLOR_RESET=$'\033[0m'

info() { printf "${COLOR_BLUE}[信息]${COLOR_RESET} %s\n" "$*"; }
success() { printf "${COLOR_GREEN}[完成]${COLOR_RESET} %s\n" "$*"; }
warn() { printf "${COLOR_YELLOW}[注意]${COLOR_RESET} %s\n" "$*" >&2; }
error() { printf "${COLOR_RED}[错误]${COLOR_RESET} %s\n" "$*" >&2; }
die() { error "$*"; exit 1; }
has_command() { command -v "$1" >/dev/null 2>&1; }

on_error() {
  local line="$1"
  error "脚本在第 ${line} 行退出。请阅读上方输出并修复问题后重新运行。"
}
trap 'on_error "$LINENO"' ERR

if [[ "${EUID}" -eq 0 ]]; then
  die "请不要使用 sudo 运行整个脚本。请以普通用户执行；脚本只会在安装系统软件时单独请求 sudo。"
fi

run_as_root() {
  if has_command sudo; then
    sudo "$@"
  else
    die "需要管理员权限来安装 Node.js，但未找到 sudo。请安装 sudo，或请管理员先安装 Node.js 与 npm。"
  fi
}

require_sudo_if_needed() {
  if ! has_command sudo; then
    die "尚未安装 Node.js/npm，且系统没有 sudo，无法自动安装。请联系管理员安装后再运行本脚本。"
  fi

  info "将请求管理员权限以安装系统软件。"
  sudo -v
}

install_node_with_system_package_manager() {
  require_sudo_if_needed

  if has_command apt-get; then
    info "检测到 apt-get，将安装 nodejs 与 npm。"
    run_as_root apt-get update
    run_as_root apt-get install -y nodejs npm
  elif has_command dnf; then
    info "检测到 dnf，将安装 nodejs 与 npm。"
    run_as_root dnf install -y nodejs npm
  elif has_command yum; then
    info "检测到 yum，将安装 nodejs 与 npm。"
    run_as_root yum install -y nodejs npm
  elif has_command pacman; then
    info "检测到 pacman，将安装 nodejs 与 npm。"
    run_as_root pacman -Syu --noconfirm --needed nodejs npm
  elif has_command zypper; then
    info "检测到 zypper，将安装 nodejs 与 npm。"
    run_as_root zypper --non-interactive install nodejs npm
  elif has_command brew; then
    # Homebrew 本身不应通过 sudo 使用。
    info "检测到 Homebrew，将安装 node。"
    brew install node
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    die "检测到 macOS，但未找到 Homebrew。请先安装 Homebrew（https://brew.sh），然后重新运行本脚本。"
  else
    die "未识别到支持的包管理器（apt-get/dnf/yum/pacman/zypper/brew）。请从 https://nodejs.org 安装 Node.js ${MIN_NODE_MAJOR}+ 和 npm 后重试。"
  fi

  # shell 会缓存 PATH 中命令的位置；安装后清除缓存。
  hash -r
}

check_node_version() {
  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  [[ "${node_major}" =~ ^[0-9]+$ ]] || die "无法解析 Node.js 版本：$(node --version)"

  if (( node_major < MIN_NODE_MAJOR )); then
    die "检测到 Node.js $(node --version)，但本脚本需要 Node.js ${MIN_NODE_MAJOR}+。请升级 Node.js 后重试；不要只升级 npm。"
  fi
}

ensure_node_and_npm() {
  local node_missing=0
  local npm_missing=0

  has_command node || node_missing=1
  has_command npm || npm_missing=1

  if (( node_missing || npm_missing )) || [[ "${FORCE_NODE_INSTALL}" == "1" ]]; then
    if (( node_missing )); then
      warn "未检测到 Node.js。"
    fi
    if (( npm_missing )); then
      warn "未检测到 npm。"
    fi
    [[ "${FORCE_NODE_INSTALL}" == "1" ]] && warn "已设置 FORCE_NODE_INSTALL=1，将尝试重新安装 Node.js/npm。"
    install_node_with_system_package_manager
  fi

  has_command node || die "安装后仍找不到 node 命令。请关闭并重新打开终端后再运行本脚本。"
  has_command npm || die "安装后仍找不到 npm 命令。请关闭并重新打开终端后再运行本脚本。"

  check_node_version
  success "Node.js $(node --version)，npm v$(npm --version) 已就绪。"
}

write_tsconfig_if_needed() {
  local config_path="$1/tsconfig.json"
  if [[ -f "${config_path}" && "${FORCE_CONFIG}" != "1" ]]; then
    warn "保留已有 ${config_path}。"
    return 1
  fi

  cat > "${config_path}" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
JSON
  success "已写入 tsconfig.json。"
  return 0
}

write_sample_if_needed() {
  local sample_path="$1/src/index.ts"
  mkdir -p "$1/src"

  if [[ -f "${sample_path}" && "${FORCE_CONFIG}" != "1" ]]; then
    warn "保留已有 ${sample_path}。"
    return 1
  fi

  cat > "${sample_path}" <<'TS'
import { readFile } from "node:fs/promises";
import WebSocket from "ws";

async function main(): Promise<void> {
  // 验证 Node.js 内置 Promise 文件 API 与 ws 的默认导入均可通过编译和运行。
  const packageJson = await readFile("package.json", "utf8");
  const packageName: string = JSON.parse(packageJson).name;

  // 只引用构造函数，不建立外部网络连接，确保测试可离线运行。
  const constructorAvailable = typeof WebSocket === "function";
  console.log(`TypeScript 环境测试成功：${packageName}；ws 构造函数可用：${constructorAvailable}`);
}

void main();
TS
  success "已写入 TypeScript 示例：src/index.ts。"
  return 0
}

ensure_package_json() {
  local project="$1"
  if [[ ! -f "${project}/package.json" ]]; then
    info "初始化 package.json。"
    (cd "${project}" && npm init -y >/dev/null)
  else
    info "检测到已有 package.json，将保留其依赖与配置。"
  fi
}

install_project_dependencies() {
  local project="$1"
  local -a npm_install=(npm install --save-dev --no-audit --no-fund typescript @types/node openai ws @types/ws)

  info "安装项目本地依赖：typescript、@types/node、openai、ws、@types/ws。"
  if [[ "${NPM_USE_SUDO}" == "1" ]]; then
    warn "NPM_USE_SUDO=1：将以管理员权限安装本地依赖。正常情况下不建议这样做，因为会产生 root 所有者文件。"
    (cd "${project}" && run_as_root -H "${npm_install[@]}")
    # 仅修复本脚本写入/安装的本地依赖文件，不递归修改项目中其他已有文件。
    [[ ! -e "${project}/node_modules" ]] || run_as_root chown -R "$(id -u):$(id -g)" "${project}/node_modules"
    [[ ! -e "${project}/package-lock.json" ]] || run_as_root chown "$(id -u):$(id -g)" "${project}/package-lock.json"
  elif [[ "${NPM_USE_SUDO}" == "0" ]]; then
    # 本地依赖在当前项目目录中安装，正确权限下不需要 sudo。
    (cd "${project}" && "${npm_install[@]}")
  else
    die "NPM_USE_SUDO 只能为 0 或 1。"
  fi
  success "TypeScript 本地依赖安装完成。"
}

set_package_scripts() {
  local project="$1"
  # 不依赖 jq；以 Node.js 读取并更新现有 JSON，保留用户其它字段。
  node - "${project}/package.json" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.private = pkg.private ?? true;
pkg.type = "module";
pkg.scripts = {
  ...(pkg.scripts ?? {}),
  check: 'tsc --noEmit',
  build: 'tsc',
  start: 'node dist/index.js',
  'test:run': 'npm run check && npm run build && npm run start'
};
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
  success "已配置 npm 命令：check、build、start、test:run。"
}

main() {
  ensure_node_and_npm

  if [[ ! -d "${PROJECT_DIR}" ]]; then
    mkdir -p "${PROJECT_DIR}"
    success "已创建项目目录：${PROJECT_DIR}"
  fi

  [[ -w "${PROJECT_DIR}" ]] || die "项目目录不可写：${PROJECT_DIR}。请选择当前用户有写权限的目录。"

  ensure_package_json "${PROJECT_DIR}"
  install_project_dependencies "${PROJECT_DIR}"
  set_package_scripts "${PROJECT_DIR}"

  local config_created=0
  local sample_created=0
  write_tsconfig_if_needed "${PROJECT_DIR}" && config_created=1 || true
  write_sample_if_needed "${PROJECT_DIR}" && sample_created=1 || true

  info "执行类型检查。"
  (cd "${PROJECT_DIR}" && npm run check)

  if (( config_created && sample_created )); then
    info "执行编译与示例程序。"
    (cd "${PROJECT_DIR}" && npm run test:run)
  else
    warn "项目中存在已有配置或示例文件，因此只执行了类型检查；未自动运行 dist/index.js。"
  fi

  cat <<EOF

${COLOR_GREEN}TypeScript 测试环境已准备完成。${COLOR_RESET}
项目目录：${PROJECT_DIR}

后续常用命令：
  cd "${PROJECT_DIR}"
  npm run check      # 仅进行类型检查
  npm run build      # 编译到 dist/
  npm start          # 执行编译后的程序
  npm run test:run   # 检查、编译并运行示例

预装依赖：typescript、@types/node、openai、ws、@types/ws。
说明：npm 依赖默认安装在项目目录的 node_modules/，不需要 sudo。
如你的环境策略强制 sudo npm install，请使用：
  NPM_USE_SUDO=1 bash "${BASH_SOURCE[0]}" "${PROJECT_DIR}"
EOF
}

main "$@"
