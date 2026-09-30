# Minimal AutoDock Vina + Open Babel image for the E-LAB docking engine (WS-A2).
# Far lighter than the full agent container — just the docking toolchain.
#
#   docker build -t anuclaw-vina:latest - < container/vina.Dockerfile
#
# Provides: vina (AutoDock Vina 1.2.5), obabel (Open Babel 3.1.1).
FROM ubuntu:24.04
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    autodock-vina openbabel ca-certificates \
    && rm -rf /var/lib/apt/lists/*
