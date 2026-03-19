# Gnirehtet Control

A GNOME Shell extension that provides a Quick Settings toggle to manage the Gnirehtet service for reverse tethering Android devices over USB.

## Features

- Toggle Gnirehtet service on/off from GNOME Quick Settings.
- Displays the number of connected Android devices.
- Notifications for device connections/disconnections and errors.
- Automatic detection if Gnirehtet is already running externally.

## Requirements

- GNOME Shell (tested on GNOME 49)
- Gnirehtet installed and available in PATH (see [Gnirehtet repository](https://github.com/Genymobile/gnirehtet) for installation).
- Android device with USB debugging enabled.

## Installation

1. Download the latest `gnirehtet-gnome@mateusvmv.shell-extension.zip` from the [Releases](https://github.com/your-username/gnirehtet-gnome/releases) page.
2. Install the extension using: `gnome-extensions install gnirehtet-gnome@mateusvmv.shell-extension.zip`
3. Restart GNOME Shell (Alt+F2, type `r`, Enter) or log out and back in.
4. Enable the extension using GNOME Extensions app or `gnome-extensions enable gnirehtet-gnome@mateusvmv.shell-extension.zip`.

## Usage

- Open GNOME Quick Settings (top-right corner).
- Look for the "Gnirehtet" toggle with a network icon.
- Toggle it to start/stop the Gnirehtet service.
- The subtitle shows the status: number of active devices or "Started externally" if managed elsewhere.

## Troubleshooting

- Ensure Gnirehtet is installed and `gnirehtet` command is in PATH.
- Check system logs for errors if the service fails to start.
- Port 31416 must be free; the extension handles conflicts by notifying and stopping.

## License

This project is licensed under the GPL-3.0 License. See LICENSE file for details.

## Contributing

Contributions are welcome! Please open issues or pull requests on the repository.
