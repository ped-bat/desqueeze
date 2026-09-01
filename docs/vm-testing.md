# Testing on Windows and Linux (from a Mac)

Desqueeze bundles per-platform binaries, so the Windows and Linux builds
have to be exercised on those systems. Two ways to do that:

1. **CI artifacts** (no VM needed) — every push builds unsigned installers
   for all three platforms; download them from the Actions run. Good enough
   to prove the pipeline works, but you can't click around the UI.
2. **Local VMs** (below) — needed to actually use the app.

## Architecture note

On Apple Silicon, VMs are ARM64:

| Guest | What runs |
| --- | --- |
| Windows 11 ARM | The x64 NSIS installer runs fine under Windows' built-in x64 emulation. |
| Ubuntu ARM64 | An x64 AppImage will **not** run. Build an arm64 AppImage inside the VM (below). |

The Linux build deliberately has no pinned `arch` in package.json: `dcraw_emu`
comes from the host's package manager, so the AppImage must be built on the
architecture it targets.

## Linux (UTM + Ubuntu ARM64)

Prerequisites (already installed on this machine):

- UTM — `brew install --cask utm`
- Ubuntu 24.04 ARM64 desktop ISO — `~/VMs/ubuntu-24.04.4-desktop-arm64.iso`

Steps:

1. Open UTM → **Create a New Virtual Machine** → **Virtualize** → **Linux**.
2. Boot ISO: select the ISO above. Give it 4 GB RAM, 4 CPUs, 40 GB disk.
3. Finish, start the VM, and run through the Ubuntu installer (~20 min).
4. In the guest, install the toolchain and build natively:

   ```bash
   sudo apt update && sudo apt install -y nodejs npm git
   git clone https://github.com/ped-bat/desqueeze.git && cd desqueeze
   npm install
   bash scripts/build-libraw-linux.sh   # apt's libraw is too old (see note)
   npm run setup          # downloads dnglab aarch64, bundles libs via patchelf
   npm test               # e2e runs the real binaries
   npx electron-vite build && npx electron-builder --linux
   ./dist/Desqueeze-*.AppImage
   ```

   > **Do not use `apt install libraw-bin`.** Ubuntu ships LibRaw 0.21.x,
   > which rejects raws from recent cameras (Sony "Lossless Compressed
   > RAW 2" bodies such as the A7C II). The build script installs 0.22.x,
   > matching macOS and Windows.

### If the VM boots to a text console instead of the installer

Ubuntu's ARM64 desktop ISO needs a graphical console that UTM's **Apple
Virtualization** backend doesn't provide out of the box. In the VM's
settings, uncheck **Use Apple Virtualization** (i.e. use the QEMU backend),
and make sure Display is `virtio-gpu-pci` (or `virtio-ramfb`). Then boot again.

If instead you land at a `UEFI Interactive Shell` or GRUB prompt, the ISO
isn't attached as a boot device — re-add it under **Drives → New Drive →
CD/DVD (External)** and move it above the disk in the boot order.

What to check: window has normal decorations (no macOS traffic lights),
drag-and-drop works, conversions succeed, output lands in `desqueezed/`.

## Windows (UTM + Windows 11 ARM)

CrystalFetch (installed: `brew install --cask crystalfetch`) downloads an
official Windows 11 ARM image from Microsoft's UUP servers.

1. Open **CrystalFetch** → select Windows 11, ARM64, your language → **Build**.
   It downloads and assembles an ISO (~5 GB, 15–30 min).
2. UTM → **Create a New Virtual Machine** → **Virtualize** → **Windows**,
   select that ISO. 8 GB RAM, 4 CPUs, 64 GB disk.
3. Install Windows (it can be used unactivated for testing).
4. Copy in the `desqueeze-windows-latest` artifact from CI (or build in the
   guest) and run the NSIS installer.

### Stuck at "Let's connect you to a network"

Windows 11 has no in-box driver for UTM's default virtio network adapter,
so OOBE dead-ends at the network screen and offers to load a driver from
disk. Skip the network requirement instead:

1. Press **Shift+F10** to open a command prompt.
2. Run `oobe\bypassnro` — the VM reboots and the network screen then shows
   **"I don't have internet"** → **"Continue with limited setup"**.
3. If that command no longer exists (removed in newer 24H2/25H2 builds),
   use `start ms-cxh:localonly` at the same prompt instead. It jumps
   straight to local-account creation.

Then fix networking once you're on the desktop, either by:

- **Changing the adapter** (simplest): VM settings → **Network** →
  *Emulated Network Card* → `e1000` or `rtl8139`, which Windows supports
  in-box; or
- **Installing virtio drivers**: mount the
  [virtio-win ISO](https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso)
  as a second CD drive and run `virtio-win-guest-tools.exe`.

Creating the VM through UTM's **Virtualize → Windows** wizard with
*"Install drivers and SPICE tools"* checked mounts that driver ISO for you
and avoids the whole problem.

What to check: installer completes, app launches, `dnglab.exe` and
`dcraw_emu.exe` resolve (a conversion succeeding proves it), window controls
present, output paths use backslashes correctly.

## Faster alternative for smoke tests

If you only need to know that the binaries resolve and convert correctly —
not how the UI feels — the CI e2e job already answers that on every push,
and it runs the same real-binary test suite used on macOS.
