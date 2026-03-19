import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SystemIndicator, QuickToggle } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

class GnirehtetManager {
    constructor() {
        this.connectedDevices = new Set();
        this.process = null;

        this.expectedTermination = false;
        this.cancellable = null;

        this.managed = false;
        this.onUpdate = [];
    }

    addCallback(callback) {
        this.onUpdate.push(callback);
    }

    removeCallback(callback) {
        const filtered = this.onUpdate.filter(f => f !== callback);
        this.onUpdate.length = 0;
        this.onUpdate.push(...filtered);
    }

    isRunning() {
        if (!GLib.find_program_in_path('gnirehtet')) {
            return false;
        }
        try {
            const [, , , exitStatus] = GLib.spawn_command_line_sync('pgrep -of "gnirehtet autorun"');
            return exitStatus === 0;
        } catch (e) {
            return false;
        }
    }
    
    async readLogs(stream) {
        while (true) {
            try {
                const [line] = await new Promise((resolve, reject) => {
                    stream.read_line_async(GLib.PRIORITY_LOW, this.cancellable, (source, res) => {
                        try {
                            resolve(source.read_line_finish(res));
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                if (line === null) break;

                const log = line.toString();

                if (log.includes('Address already in use')) {
                    this.handleFailure("Port 31416 is already in use.");
                    this.stopService();
                    break;
                }

                const connectMatch = log.match(/Client #(\d+) connected/);
                const disconnectMatch = log.match(/Client #(\d+) disconnected/);

                if (connectMatch) {
                    this.connectedDevices.add(connectMatch[1]);
                    // Main.notify('Gnirehtet', `Device #${connectMatch[1]} connected`);
                    this.onUpdate.forEach(func => func(1));
                }
                if (disconnectMatch) {
                    this.connectedDevices.delete(disconnectMatch[1]);
                    // Main.notify('Gnirehtet', `Device #${disconnectMatch[1]} disconnected`);
                    this.onUpdate.forEach(func => func(1));
                }
            } catch (e) {
                break;
            }
        }
    }

    startService() {
        this.connectedDevices.clear();
        this.expectedTermination = false;
        this.managed = !this.isRunning();
        if (!this.managed) return;

        try {
            this.cancellable = new Gio.Cancellable();
            this.process = new Gio.Subprocess({
                argv: ['gnirehtet', 'autorun'],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });

            this.process.init(this.cancellable);
            this.readLogs(new Gio.DataInputStream({ base_stream: this.process.get_stdout_pipe() }));
            this.readLogs(new Gio.DataInputStream({ base_stream: this.process.get_stderr_pipe() }));

            this.process.wait_async(this.cancellable, (proc, res) => {
                try {
                    proc.wait_finish(res);
                    if (!this.expectedTermination && !proc.get_successful()) {
                        this.handleFailure("Service stopped unexpectedly.");
                    }
                } catch (e) {
                    if (!this.expectedTermination && !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        this.handleFailure(e.message);
                    }
                }
            });
        } catch (e) {
            this.handleFailure(e.message);
        }
    }

    async stopService() {
        this.expectedTermination = true;
        if (this.cancellable) {
            this.cancellable.cancel();
            this.cancellable = null;
        }
        this.connectedDevices.clear();

        async function killProcess(argv) {
            const subprocess = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.NONE,
            });
            subprocess.init(null);
            return new Promise((resolve) => {
                subprocess.wait_async(null, (proc, res) => {
                    proc.wait_finish(res);
                    resolve(proc.get_successful());
                });
            });
        }
        
        this.onUpdate.forEach(func => func(0));
        try {
            const success = await killProcess(['pkill', '-f', 'gnirehtet autorun'])
                || await killProcess(['pkexec', 'pkill', '-f', 'gnirehtet autorun']);
            if (!success) {
                throw 'failed to kill process';
            }
            if (this.isRunning()) {
                throw 'process still running';
            }
        } catch (e) {
            this.handleFailure(`Failed to stop gnirehtet: ${e.message}`, 1);
            this.onUpdate.forEach(func => func(1));
            return false;
        }
        return true;
    }

    handleFailure(message, running = 0) {
        this.expectedTermination = false;
        this.onUpdate.forEach(func => func(running));
        Main.notify('Gnirehtet Error', message);
    }
}

const GnirehtetToggle = GObject.registerClass(
class GnirehtetToggle extends QuickToggle {
    _init(Me) {
        super._init({
            title: 'Gnirehtet',
            iconName: 'network-transmit-receive-symbolic',
            toggleMode: true,
        });

        this._settings = Me._settings;
        this.checked = this._settings.get_boolean('auto-start');
        this._manager = Me._manager;
        if (this.checked) {
            this._manager.startService();
        }
        this._syncUI();
        
        this.connect('clicked', () => this._toggleService());
        this.callback = (checked) => {
            if (typeof checked === 'boolean') this.checked = checked;
            this._syncUI()
        };
        this._manager.addCallback(this.callback);
    }

    _syncUI() {
        this.visible = Main.sessionMode.allowSettings;

        if (!this.checked) {
            this.subtitle = null;
        } else if (this._manager.managed) {
            const count = this._manager.connectedDevices.size;
            this.subtitle = count > 0 ? `${count} Active` : 'No devices';
        } else {
            this.subtitle = `Started externally`;
	    }
    }

    _toggleService() {
        if (this.checked) this._manager.startService();
        else this._manager.stopService();
        this._settings.set_boolean('auto-start', this.checked);
        this._syncUI();
    }
});

const GnirehtetIndicator = GObject.registerClass(
class GnirehtetIndicator extends SystemIndicator {
    _init(Me) {
        super._init();
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'network-transmit-receive-symbolic';
        this._indicator.hide();
        Me._indicatorInstance = this;
        this._toggle = new GnirehtetToggle(Me);
        this.quickSettingsItems.push(this._toggle);

        Main.panel.statusArea.quickSettings.addExternalIndicator(this);
    }
});

export default class GnirehtetExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._manager = new GnirehtetManager();
        this._indicator = new GnirehtetIndicator(this);

        this._manager.addCallback(() => this._updateIndicator());

        this._sessionModeChangedId = Main.sessionMode.connect(
            'updated',
            () => this._indicator.quickSettingsItems.forEach(item => item._syncUI?.()),
        );
    }

    _updateIndicator() {
        if (this._manager.connectedDevices.size > 0) {
            this._indicatorInstance._indicator.show();
        } else {
            this._indicatorInstance._indicator.hide();
        }
    }

    disable() {
        if (this._sessionModeChangedId) {
            Main.sessionMode.disconnect(this._sessionModeChangedId);
            this._sessionModeChangedId = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._manager) {
            this._manager.stopService();
            this._manager.removeCallback(this.callback);
            delete this._manager;
            this._manager = null;
        }
    }
}
