"""POSIX smoke test that drives the public command through a real PTY."""
import os
import pty
import select
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path


def main() -> None:
    if os.name != "posix":
        raise SystemExit("This smoke test requires POSIX pty support")
    repo = Path(__file__).resolve().parents[4]
    with tempfile.TemporaryDirectory(prefix="catapult-pty-") as temporary:
        root = Path(temporary)
        source = root / "photos"
        source.mkdir()
        image = source / "photo.jpg"
        subprocess.run(
            ["node", "-e", "require('sharp')({create:{width:24,height:16,channels:3,background:'green'}}).jpeg().toFile(process.argv[1])", str(image)],
            cwd=repo / "packages" / "cli", check=True,
        )
        master, slave = pty.openpty()
        process = subprocess.Popen(
            ["pnpm", "package-photos", str(source)], cwd=repo,
            stdin=slave, stdout=slave, stderr=slave, close_fds=True,
        )
        os.close(slave)
        output = bytearray()

        def wait_for(marker: bytes, timeout: float = 10) -> None:
            end = time.monotonic() + timeout
            while marker not in output and time.monotonic() < end:
                readable, _, _ = select.select([master], [], [], 0.2)
                if readable:
                    try:
                        output.extend(os.read(master, 65536))
                    except OSError:
                        break
            if marker not in output:
                raise RuntimeError(f"Timed out waiting for {marker!r}; tail={bytes(output[-800:])!r}")

        def send(key: bytes) -> None:
            time.sleep(0.5)
            os.write(master, key)
            time.sleep(0.5)

        try:
            wait_for(b"Source folder path")
            send(b"\r")
            wait_for(b"Enter to continue")
            send(b"\r")
            wait_for(b"PHOTOS")
            send(b"\r")
            wait_for(b"RAW")
            send(b"x")
            send(b"\r")
            wait_for(b"SUMMARY")
            send(b"\r")
            wait_for(b"OUTPUT")
            send(b"\r")
            wait_for(b"Created ", timeout=20)
            send(b"\r")
            process.wait(timeout=10)
            archive = root / "photos.catapult.zip"
            with zipfile.ZipFile(archive) as package:
                assert "manifest.json" in package.namelist()
                assert package.testzip() is None
            print(f"PTY smoke passed: {archive}")
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
            os.close(master)


if __name__ == "__main__":
    main()
