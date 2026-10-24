#!/usr/bin/env bash
# 生成本地开发用 HTTPS 证书（localhost + 局域网 IP），供手机真机访问
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .cert
IP="$(ipconfig getifaddr en0 || true)"
HOSTS="localhost 127.0.0.1 $(hostname)"
[ -n "${IP}" ] && HOSTS="${HOSTS} ${IP}"

mkcert -cert-file .cert/dev.pem -key-file .cert/dev-key.pem ${HOSTS}

echo ""
echo "证书已生成到 .cert/"
if [ -n "${IP}" ]; then
  echo "手机（同 WiFi）访问: https://${IP}:5173"
fi
echo "首次在手机上访问前，需要安装并信任 mkcert 根证书：mkcert -CAROOT 查看目录，把其中的 rootCA.pem 传到手机安装。"
