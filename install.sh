#!/usr/bin/env bash

# install-elo.sh
# Script de instalación para añadir 'elo' al PATH del sistema (Mac/Linux/WSL)

set -e

# Detectar el directorio donde está este script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "========================================="
echo "  Instalando Elo CLI en tu sistema..."
echo "========================================="

# Dar permisos de ejecución al script envoltorio
chmod +x "$DIR/apps/elo-cli/elo"

# Crear enlace simbólico en /usr/local/bin
# Dependiendo del sistema, esto puede requerir sudo
DEST="/usr/local/bin/elo"

if [ -w "/usr/local/bin" ]; then
    ln -sf "$DIR/apps/elo-cli/elo" "$DEST"
    echo "✅ Instalado correctamente en $DEST"
else
    echo "Para instalar globalmente se requieren permisos de administrador."
    sudo ln -sf "$DIR/apps/elo-cli/elo" "$DEST"
    echo "✅ Instalado correctamente en $DEST usando sudo"
fi

echo "========================================="
echo "¡Todo listo! Ya puedes usar el comando 'elo' desde cualquier directorio."
echo "Prueba a ejecutar: elo --help"
echo "========================================="
