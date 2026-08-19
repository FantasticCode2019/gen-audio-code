#!/usr/bin/env bash
# 一键部署最新稳定版 CPython、项目虚拟环境和基础依赖。
# 用法：bash setup-python.sh [项目目录]
#
# 可选环境变量：
#   PYTHON_VERSION=3.14.7            指定 Python 版本；默认从 python.org 下载页获取最新稳定版。
#   PYTHON_EXECUTABLE=/path/python   使用指定的已安装解释器，不自动安装 CPython。
#   FORCE_SAMPLE=1                   覆盖已有 main.py 示例。
#   RECREATE_VENV=1                  删除并重建已有 .venv（会清除该虚拟环境中的已装包）。
#
# 说明：本脚本适用于 Linux 与 macOS 的 bash/zsh 环境；不使用 sudo pip。
# 系统依赖或 CPython 源码安装才会请求 sudo；项目包只安装到 .venv 中。

set -Eeuo pipefail
IFS=$'\n\t'

readonly PROJECT_DIR="${1:-python-playground}"
readonly REQUESTED_PYTHON_VERSION="${PYTHON_VERSION:-}"
readonly REQUESTED_PYTHON_EXECUTABLE="${PYTHON_EXECUTABLE:-}"
readonly FORCE_SAMPLE="${FORCE_SAMPLE:-0}"
readonly RECREATE_VENV="${RECREATE_VENV:-0}"
readonly PYTHON_RELEASES_URL="https://www.python.org/downloads/"

COLOR_RED=$'\033[0;31m'
COLOR_GREEN=$'\033[0;32m'
COLOR_YELLOW=$'\033[0;33m'
COLOR_BLUE=$'\033[0;34m'
COLOR_RESET=$'\033[0m'

# 状态信息输出到标准错误，避免命令替换 $(...) 获取路径或版本时混入显示文本。
info() { printf "${COLOR_BLUE}[信息]${COLOR_RESET} %s\n" "$*" >&2; }
success() { printf "${COLOR_GREEN}[完成]${COLOR_RESET} %s\n" "$*" >&2; }
warn() { printf "${COLOR_YELLOW}[注意]${COLOR_RESET} %s\n" "$*" >&2; }
error() { printf "${COLOR_RED}[错误]${COLOR_RESET} %s\n" "$*" >&2; }
die() { error "$*"; exit 1; }
has_command() { command -v "$1" >/dev/null 2>&1; }

on_error() {
  local line="$1"
  # 命令替换会在子 shell 中继承本陷阱；只在主 shell 报告，避免一次失败被重复打印。
  (( BASH_SUBSHELL == 0 )) || return 0
  error "脚本在第 ${line} 行退出。请根据上方提示修复问题后重新运行。"
}
trap 'on_error "$LINENO"' ERR

if [[ "${EUID}" -eq 0 ]]; then
  die "请不要用 sudo 执行整个脚本。应以普通用户执行；脚本只会在安装系统软件时单独请求 sudo。"
fi

run_as_root() {
  has_command sudo || die "需要管理员权限，但未找到 sudo。请请管理员安装 Python 与构建依赖后再运行脚本。"
  sudo "$@"
}

ensure_sudo() {
  has_command sudo || die "需要管理员权限来安装系统依赖，但未找到 sudo。"
  info "将请求管理员权限以安装系统级依赖。"
  sudo -v
}

install_build_dependencies() {
  # macOS 通过 Homebrew 获取预编译 Python，不需要 sudo 或源码编译依赖。
  if [[ "$(uname -s)" == "Darwin" ]] && has_command brew; then
    return 0
  fi

  ensure_sudo

  if has_command apt-get; then
    info "检测到 apt-get，安装 CPython 编译所需依赖与 wget。"
    run_as_root apt-get update
    run_as_root apt-get install -y --no-install-recommends \
      build-essential ca-certificates wget curl \
      libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev \
      libffi-dev liblzma-dev libgdbm-dev libgdbm-compat-dev libncursesw5-dev \
      uuid-dev tk-dev
  elif has_command dnf; then
    info "检测到 dnf，安装 CPython 编译所需依赖与 wget。"
    run_as_root dnf install -y \
      gcc gcc-c++ make ca-certificates wget curl openssl-devel zlib-devel \
      bzip2-devel readline-devel sqlite-devel libffi-devel xz-devel gdbm-devel \
      ncurses-devel libuuid-devel tk-devel
  elif has_command yum; then
    info "检测到 yum，安装 CPython 编译所需依赖与 wget。"
    run_as_root yum install -y \
      gcc gcc-c++ make ca-certificates wget curl openssl-devel zlib-devel \
      bzip2-devel readline-devel sqlite-devel libffi-devel xz-devel gdbm-devel \
      ncurses-devel libuuid-devel tk-devel
  elif has_command pacman; then
    info "检测到 pacman，安装 CPython 编译所需依赖与 wget。"
    run_as_root pacman -Syu --noconfirm --needed \
      base-devel ca-certificates wget curl openssl zlib bzip2 readline sqlite \
      libffi xz gdbm ncurses util-linux tk
  elif has_command zypper; then
    info "检测到 zypper，安装 CPython 编译所需依赖与 wget。"
    run_as_root zypper --non-interactive install \
      gcc gcc-c++ make ca-certificates wget curl libopenssl-devel zlib-devel \
      libbz2-devel readline-devel sqlite3-devel libffi-devel xz-devel gdbm-devel \
      ncurses-devel libuuid-devel tk-devel
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    die "检测到 macOS，但未找到 Homebrew。请先安装 Homebrew（https://brew.sh），或从 python.org 安装 Python 后以 PYTHON_EXECUTABLE 指定解释器。"
  else
    die "未识别支持的包管理器。请先从 https://www.python.org/downloads/ 安装 Python，并以 PYTHON_EXECUTABLE=/路径/python 重新运行。"
  fi
}

ensure_downloader() {
  if has_command wget || has_command curl; then
    return 0
  fi
  install_build_dependencies >&2
  has_command wget || has_command curl || die "安装后仍找不到 wget 或 curl，无法获取 Python 官方版本信息。"
}

fetch_url() {
  local url="$1"
  local output="$2"
  if has_command wget; then
    # wget 会显示下载进度，适合源码包等较大文件。
    wget --https-only --secure-protocol=TLSv1_2 --show-progress --progress=bar:force:noscroll \
      --tries=3 --timeout=30 -O "${output}" "${url}"
  else
    curl --fail --location --retry 3 --connect-timeout 30 --output "${output}" "${url}"
  fi
}

fetch_text() {
  local url="$1"
  if has_command curl; then
    # --compressed 会请求并自动解压压缩响应，避免把 gzip 二进制内容交给 HTML 解析器。
    curl --fail --location --retry 3 --connect-timeout 30 --silent --show-error --compressed "${url}"
  elif has_command wget; then
    # 部分服务器会对 wget 返回 gzip 响应；落盘后按实际格式解压，兼容两类响应。
    local temporary_response
    temporary_response="$(mktemp)"
    wget --https-only --secure-protocol=TLSv1_2 --tries=3 --timeout=30 -qO "${temporary_response}" "${url}"
    if gzip -t "${temporary_response}" >/dev/null 2>&1; then
      gzip -dc "${temporary_response}"
    else
      cat "${temporary_response}"
    fi
    rm -f "${temporary_response}"
  else
    die "缺少 curl 和 wget，无法读取 Python 官方版本信息。"
  fi
}

validate_version() {
  local version="$1"
  [[ "${version}" =~ ^3\.[0-9]+\.[0-9]+$ ]] || die "Python 版本格式无效：${version}。应类似 3.14.7。"
}

get_latest_stable_python_version() {
  local page version
  ensure_downloader
  info "从 python.org 查询当前最新稳定版 Python。"
  page="$(fetch_text "${PYTHON_RELEASES_URL}")" || die "无法读取 Python 官方下载页。请检查网络，或通过 PYTHON_VERSION=3.x.y 指定版本。"
  version="$(printf '%s' "${page}" | LC_ALL=C grep -a -oE 'Download Python 3\.[0-9]+\.[0-9]+' | head -n 1 | awk '{print $3}' || true)"
  [[ -n "${version}" ]] || die "无法从 Python 官方下载页解析最新稳定版本。请通过 PYTHON_VERSION=3.x.y 显式指定后重试。"
  validate_version "${version}"
  printf '%s\n' "${version}"
}

version_of() {
  "$1" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))'
}

find_installed_python() {
  local requested_version="$1"
  local executable candidate detected

  if [[ -n "${REQUESTED_PYTHON_EXECUTABLE}" ]]; then
    executable="${REQUESTED_PYTHON_EXECUTABLE}"
    [[ -x "${executable}" ]] || die "PYTHON_EXECUTABLE 不存在或不可执行：${executable}"
    detected="$(version_of "${executable}")"
    if [[ "${detected}" != "${requested_version}" ]]; then
      warn "使用指定解释器 ${executable}（Python ${detected}），它不是目标版本 ${requested_version}。"
    fi
    printf '%s\n' "${executable}"
    return 0
  fi

  for candidate in "python${requested_version%.*}" python3 python; do
    if has_command "${candidate}"; then
      executable="$(command -v "${candidate}")"
      detected="$(version_of "${executable}")"
      if [[ "${detected}" == "${requested_version}" ]]; then
        printf '%s\n' "${executable}"
        return 0
      fi
    fi
  done
  return 1
}

install_latest_python() (
  # 使用子 shell 限制临时目录的清理陷阱，避免影响脚本后续函数。
  # 本函数以标准输出返回解释器路径，因此所有安装命令的输出都要改道标准错误。
  local version="$1"
  local major_minor="${version%.*}"
  local source_url="https://www.python.org/ftp/python/${version}/Python-${version}.tgz"
  local install_prefix="${HOME}/.local/cpython-${version}"
  local installed_python="${install_prefix}/bin/python${major_minor}"

  if [[ -x "${installed_python}" ]] && [[ "$(version_of "${installed_python}")" == "${version}" ]]; then
    printf '%s\n' "${installed_python}"
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && has_command brew; then
    local formula="python@${major_minor}"
    info "使用 Homebrew 安装 ${formula}。"
    brew install "${formula}" >&2
    installed_python="$(brew --prefix "${formula}")/bin/python${major_minor}"
    [[ -x "${installed_python}" ]] || die "Homebrew 安装后未找到 ${installed_python}。"
    printf '%s\n' "${installed_python}"
    return 0
  fi

  install_build_dependencies >&2
  ensure_downloader
  has_command make || die "缺少 make，无法编译 CPython。"
  has_command tar || die "缺少 tar，无法解压 CPython 源码。"

  local build_dir archive
  build_dir="$(mktemp -d)"
  archive="${build_dir}/Python-${version}.tgz"
  trap 'rm -rf "${build_dir}"' EXIT

  info "下载 Python ${version} 官方源码包。"
  fetch_url "${source_url}" "${archive}" >&2
  tar -xzf "${archive}" -C "${build_dir}" >&2

  info "编译并以 altinstall 安装 Python ${version} 到 ${install_prefix}；这不会覆盖系统的 python3。"
  (
    cd "${build_dir}/Python-${version}"
    ./configure --prefix="${install_prefix}" --with-ensurepip=install
    make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"
    make altinstall
  ) >&2

  [[ -x "${installed_python}" ]] || die "CPython 编译完成但未找到 ${installed_python}。"
  [[ "$(version_of "${installed_python}")" == "${version}" ]] || die "安装后的 Python 版本不匹配。"
  success "Python ${version} 已安装到 ${install_prefix}。"
  printf '%s\n' "${installed_python}"
)

create_or_reuse_venv() {
  local project="$1"
  local python_executable="$2"
  local venv_dir="${project}/.venv"
  local venv_python="${venv_dir}/bin/python"

  if [[ -d "${venv_dir}" && "${RECREATE_VENV}" == "1" ]]; then
    warn "RECREATE_VENV=1：将删除已有虚拟环境 ${venv_dir}。"
    rm -rf "${venv_dir}"
  elif [[ -d "${venv_dir}" && ! -x "${venv_python}" ]]; then
    die "发现不完整的 ${venv_dir}。请设置 RECREATE_VENV=1 后重新运行。"
  fi

  if [[ ! -d "${venv_dir}" ]]; then
    info "创建隔离虚拟环境：${venv_dir}"
    # --upgrade-deps 会调用 pip，其日志同样不能混进本函数返回的路径。
    "${python_executable}" -m venv --upgrade-deps "${venv_dir}" >&2
  else
    info "复用已有虚拟环境：${venv_dir}"
  fi

  [[ -x "${venv_python}" ]] || die "虚拟环境创建失败，未找到 ${venv_python}。"
  printf '%s\n' "${venv_python}"
}

write_requirements() {
  local project="$1"
  local requirements_path="${project}/requirements.bootstrap.txt"
  cat > "${requirements_path}" <<'REQ'
# 此文件由 setup-python.sh 管理；不锁版本，因此每次部署会安装当时的最新兼容稳定包。
openai
websockets
httpx
REQ
  success "已写入 requirements.bootstrap.txt。"
  printf '%s\n' "${requirements_path}"
}

install_project_dependencies() {
  local venv_python="$1"
  local requirements_path="$2"

  info "升级虚拟环境中的 pip，并安装 openai、websockets 与 httpx。"
  "${venv_python}" -m pip install --upgrade --no-input pip
  "${venv_python}" -m pip install --upgrade --no-input -r "${requirements_path}"
  success "项目依赖安装完成。"
}

write_sample_if_needed() {
  local project="$1"
  local sample_path="${project}/main.py"

  if [[ -f "${sample_path}" && "${FORCE_SAMPLE}" != "1" ]]; then
    warn "保留已有 ${sample_path}。如需覆盖，请设置 FORCE_SAMPLE=1。"
    return 1
  fi

  cat > "${sample_path}" <<'PY'
import asyncio
import json
import os
from importlib.metadata import version

import httpx
import openai
import websockets


async def main() -> None:
    """仅验证导入和异步运行环境；不会发起网络请求或读取 API 密钥。"""
    report = {
        "python": os.sys.version.split()[0],
        "openai": version("openai"),
        "websockets": version("websockets"),
        "httpx": version("httpx"),
        "asyncio_loop_running": asyncio.get_running_loop().is_running(),
        "openai_module_loaded": openai is not None,
        "websockets_module_loaded": websockets is not None,
        "httpx_module_loaded": httpx is not None,
        "openai_api_key_configured": bool(os.getenv("OPENAI_API_KEY")),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
PY
  success "已写入依赖验证示例：main.py。"
  return 0
}

main() {
  [[ "${FORCE_SAMPLE}" == "0" || "${FORCE_SAMPLE}" == "1" ]] || die "FORCE_SAMPLE 只能为 0 或 1。"
  [[ "${RECREATE_VENV}" == "0" || "${RECREATE_VENV}" == "1" ]] || die "RECREATE_VENV 只能为 0 或 1。"

  local target_version python_executable venv_python requirements_path sample_created=0
  target_version="${REQUESTED_PYTHON_VERSION:-$(get_latest_stable_python_version)}"
  validate_version "${target_version}"
  info "目标 Python 版本：${target_version}"

  if ! python_executable="$(find_installed_python "${target_version}")"; then
    warn "未检测到 Python ${target_version}，将进行用户目录安装。"
    python_executable="$(install_latest_python "${target_version}")"
  fi
  [[ -x "${python_executable}" ]] || die "得到的解释器路径不可执行；安装步骤可能把日志混入了标准输出。"
  success "使用解释器：${python_executable}（Python $(version_of "${python_executable}")）。"

  if [[ ! -d "${PROJECT_DIR}" ]]; then
    mkdir -p "${PROJECT_DIR}"
    success "已创建项目目录：${PROJECT_DIR}"
  fi
  [[ -w "${PROJECT_DIR}" ]] || die "项目目录不可写：${PROJECT_DIR}。请选择当前用户有写权限的目录。"

  venv_python="$(create_or_reuse_venv "${PROJECT_DIR}" "${python_executable}")"
  requirements_path="$(write_requirements "${PROJECT_DIR}")"
  install_project_dependencies "${venv_python}" "${requirements_path}"
  write_sample_if_needed "${PROJECT_DIR}" && sample_created=1 || true

  info "验证标准库与第三方包导入。"
  "${venv_python}" -c 'import asyncio, json, os, httpx, openai, websockets; print("导入验证通过")'

  if (( sample_created )); then
    info "运行新生成的示例程序。"
    (cd "${PROJECT_DIR}" && "${venv_python}" main.py)
  else
    warn "因保留了已有 main.py，未自动运行该文件。"
  fi

  cat <<EOF

${COLOR_GREEN}Python 环境已准备完成。${COLOR_RESET}
项目目录：${PROJECT_DIR}
虚拟环境：${PROJECT_DIR}/.venv
使用的解释器：${venv_python}

后续常用命令：
  cd "${PROJECT_DIR}"
  source .venv/bin/activate       # 激活虚拟环境（可选）
  python main.py                  # 执行示例
  python -m pip install -r requirements.bootstrap.txt
  deactivate                       # 退出虚拟环境

依赖说明：asyncio、json、os 属于 Python 标准库，无需安装；
openai、websockets 与 httpx 为第三方包，已安装到项目 .venv 中。
EOF
}

main "$@"
