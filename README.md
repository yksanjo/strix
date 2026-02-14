# Strix - Autonomous Recon Agent Platform

**"Security Recon in 60 seconds"**

Strix is a powerful CLI tool that provides automated security reconnaissance, vulnerability assessment, and exploit simulation in a single command. Built with SOAR principles, it streamlines the security assessment process.

## Features

- 🔍 **Target Discovery** - Maps entire attack surface
- 🛡️ **Vulnerability Assessment** - Identifies weak endpoints and security issues
- ⚡ **Exploit Simulation** - Educational demonstrations of attack vectors
- 📊 **SOAR Orchestration** - Automated workflow with parallel execution
- 📄 **PDF Reports** - Professional executive summary reports
- 🔗 **sslip.io Integration** - DNS resolution support

## Installation

```bash
# Clone and install dependencies
cd strix
npm install

# Make executable
chmod +x bin/strix.js

# Link globally (optional)
npm link
```

## Usage

### Basic Scan

```bash
# Scan a domain
./bin/strix.js recon example.com

# Scan an IP address
./bin/strix.js recon 192.168.1.1

# Scan with CIDR
./bin/strix.js recon 192.168.1.0/24
```

### Advanced Options

```bash
# Full scan with PDF report
./bin/strix.js recon example.com -o report.pdf

# Quick scan (reduced checks)
./bin/strix.js recon example.com --quick

# Custom timeout
./bin/strix.js recon example.com -t 30

# Verbose output
./bin/strix.js recon example.com --verbose

# Custom ports
./bin/strix.js recon example.com -p 80,443,8080

# Disable colors
./bin/strix.js recon example.com --no-color
```

### Using sslip.io

```bash
# Scan using sslip.io domain
./bin/strix.js recon 192-168-1-1.sslip.io
```

## Command Options

| Option | Short | Description |
|--------|-------|-------------|
| `--output <file>` | `-o` | Output PDF report |
| `--timeout <seconds>` | `-t` | Max scan time (default: 60) |
| `--quick` | `-q` | Quick scan mode |
| `--verbose` | `-v` | Verbose output |
| `--no-color` | | Disable colored output |
| `--ports <ports>` | `-p` | Custom ports to scan |

## Output

### Terminal Output

```
    ███████╗██╗   ██╗██████╗ ███████╗██████╗     ██████╗ ███████╗ ██████╗ 
    ██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗    ██╔══██╗██╔════╝██╔════╝ 
    ███████╗██║   ██║██████╔╝█████╗  ██████╔╝    ██████╔╝█████╗  ██║      
    ╚════██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗    ██╔══██╗██╔══╝  ██║      
    ███████║╚██████╔╝██║     ███████╗██║  ██║    ██║  ██║███████╗╚██████╗ 
    ╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝    ╚═╝  ╚═╝╚══════╝ ╚═════╝ 

    Autonomous Recon Agent Platform
    "Security Recon in 60 seconds"

══════════════════════════════════════════════════════════════════
  Target Discovery
══════════════════════════════════════════════════════════════════
```

### PDF Report

The PDF report includes:
- Executive Summary
- Risk Score and Level
- Vulnerability Breakdown
- Technical Findings
- Open Ports & Services
- Attack Surface Analysis
- Remediation Recommendations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      STRIX CLI                                   │
│                   (One CLI Command)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SOAR ORCHESTRATION                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Target    │  │   Recon     │  │    Vulnerability        │ │
│  │  Discovery  │──│   Engine    │──│    Assessment           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                     │              │
│         ▼                ▼                     ▼              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           Exploit Simulation (Safe/Educational)          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              PDF Report Generator                        │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Modules

- **Discovery** - Network mapping, port scanning, service detection
- **Vulnerability Assessment** - Security header checks, SSL analysis, exposure detection
- **Exploit Simulation** - Educational demonstrations (NO actual exploits)
- **SOAR Orchestrator** - Workflow automation and coordination
- **PDF Generator** - Professional report generation

## Security & Ethics

⚠️ **Important**: This tool is designed for:
- Authorized security testing
- Educational purposes
- Security assessments where you have permission

This tool does NOT:
- Perform actual exploitation
- Persist on systems
- Cause harm to target systems

Always ensure you have explicit permission before scanning any target.

## License

MIT

## Author

Strix - Autonomous Recon Agent Platform
