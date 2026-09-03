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

Then fix networking once you're on the desktop by installing the **UTM
Windows Guest Tools**, which is also what makes the shared folder work:

```bash
curl -L -o ~/VMs/utm-guest-tools.iso \
  https://getutm.app/downloads/utm-guest-tools-latest.iso
```

Attach it to the VM's CD drive, then in the guest run
`utm-guest-tools-<version>.exe` and reboot. It installs:

- **NetKVM** — the virtio network driver. This is precisely the file OOBE
  asked for; the ARM64 build lives at `Drivers\NetKVM\w11\ARM64` on that
  ISO. Windows 11 ARM has no in-box virtio driver, which is why there is no
  internet until this is installed.
- **spice-webdavd** — directory sharing. UTM's `DirectoryShareMode` is
  WebDAV, and the guest needs this daemon before the shared folder appears.
  If it still doesn't show up in *This PC*, run
  `C:\Program Files\SPICE webdavd\map-drive.bat`.

The guest tools installer is a 32-bit x86 binary — that's fine, Windows 11
ARM runs it under emulation and it lays down the correct ARM64 drivers.

> Swapping the adapter to `e1000`/`rtl8139` is often suggested as a
> shortcut. Don't bother on ARM: those in-box drivers ship with x64
> Windows, not the ARM64 build, and it leaves directory sharing broken
> anyway. One guest-tools install fixes both.

Creating the VM through UTM's **Virtualize → Windows** wizard with
*"Install drivers and SPICE tools"* checked mounts that driver ISO for you
and avoids the whole problem.

### Getting files in when there is no network yet

Chicken-and-egg: the installer you want to test can't be downloaded inside
a VM with no networking. Build a CD image on the Mac and mount it:

```bash
mkdir -p /tmp/stage && cd /tmp/stage
curl -L -O https://github.com/ped-bat/desqueeze/releases/latest/download/Desqueeze-Windows-x64.exe
cp ~/some-photo.ARW demo.ARW
hdiutil makehybrid -iso -joliet -default-volume-name DESQUEEZE \
  -o ~/VMs/desqueeze-transfer.iso /tmp/stage
```

Attach it in UTM (CD icon in the toolbar → browse). Note that UTM remembers
removable-drive contents in its own registry, *not* in the VM's
`config.plist` — so once a drive has been pointed at a path, overwriting
the file at that path is the way to refresh what the guest sees. Editing
`config.plist` by hand gets silently overridden by that bookmark.


What to check: installer completes, app launches, `dnglab.exe` and
`dcraw_emu.exe` resolve (a conversion succeeding proves it), window controls
present, output paths use backslashes correctly.

## Faster alternative for smoke tests

If you only need to know that the binaries resolve and convert correctly —
not how the UI feels — the CI e2e job already answers that on every push,
and it runs the same real-binary test suite used on macOS.
