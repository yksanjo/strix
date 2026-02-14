/**
 * PDF Report Generation Module
 * Creates executive summary PDF reports
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate comprehensive PDF report
 * @param {object} results - Scan results from orchestrator
 * @param {string} outputPath - Output file path
 * @returns {Promise<void>}
 */
async function generatePDFReport(results, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: 'Strix Security Report',
          Author: 'Strix Autonomous Recon',
          Subject: 'Security Reconnaissance Report'
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(24)
         .fillColor('#1a73e8')
         .text('STRIX', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(14)
         .fillColor('#5f6368')
         .text('Autonomous Recon Agent Platform', { align: 'center' });
      
      doc.moveDown(2);

      // Executive Summary Section
      doc.fontSize(18)
         .fillColor('#202124')
         .text('EXECUTIVE SUMMARY', { underline: true });
      
      doc.moveDown();

      const summary = results.summary || {};
      const discovery = results.discovery || {};
      const vulnerabilities = results.vulnerabilities || {};

      // Scan Overview
      doc.fontSize(12)
         .fillColor('#202124');
      
      doc.text(`Target: ${summary.target || discovery.target || 'N/A'}`);
      doc.text(`IP Address: ${summary.ip || discovery.ip || 'N/A'}`);
      doc.text(`Scan Date: ${new Date(summary.scanDate || Date.now()).toLocaleString()}`);
      doc.text(`Scan Duration: ${summary.scanDuration || 'N/A'} seconds`);
      
      doc.moveDown();

      // Risk Score Box
      const riskColor = getRiskColor(summary.riskLevel);
      doc.fillColor(riskColor)
         .rect(50, doc.y, 150, 60)
         .fill();
      
      doc.fillColor('#ffffff')
         .fontSize(12)
         .text(`Risk Level`, 60, doc.y - 50);
      
      doc.fontSize(24)
         .text(summary.riskLevel || 'N/A', 60, doc.y - 35);
      
      doc.moveDown(4);

      // Risk Score Details
      doc.fillColor('#202124')
         .fontSize(12)
         .text(`Risk Score: ${summary.riskScore || 0}/100`);
      
      doc.moveDown();

      // Statistics
      doc.fontSize(14)
         .fillColor('#202124')
         .text('STATISTICS');
      
      doc.moveDown(0.5);
      
      doc.fontSize(11);
      doc.text(`Open Ports: ${summary.stats?.openPorts || 0}`);
      doc.text(`Services Identified: ${summary.stats?.services || 0}`);
      doc.text(`Total Vulnerabilities: ${summary.stats?.vulnerabilities?.total || 0}`);
      
      doc.moveDown();
      
      // Vulnerability breakdown
      doc.fontSize(12)
         .text('Vulnerability Breakdown:', { underline: true });
      
      doc.fontSize(11);
      doc.fillColor('#d93025').text(`  Critical: ${summary.stats?.vulnerabilities?.critical || 0}`);
      doc.fillColor('#ea4335').text(`  High: ${summary.stats?.vulnerabilities?.high || 0}`);
      doc.fillColor('#fbbc04').text(`  Medium: ${summary.stats?.vulnerabilities?.medium || 0}`);
      doc.fillColor('#1a73e8').text(`  Low: ${summary.stats?.vulnerabilities?.low || 0}`);
      doc.fillColor('#5f6368').text(`  Informational: ${summary.stats?.vulnerabilities?.info || 0}`);
      
      doc.fillColor('#202124');
      doc.moveDown();

      // Attack Surface
      if (results.attackSurface) {
        doc.fontSize(14)
           .text('ATTACK SURFACE ANALYSIS');
        
        doc.moveDown(0.5);
        
        doc.fontSize(11);
        doc.text(`Total Attack Vectors: ${results.attackSurface.totalVectors || 0}`);
        doc.text(`Critical Vectors: ${results.attackSurface.criticalVectors || 0}`);
        doc.text(`High Risk Vectors: ${results.attackSurface.highVectors || 0}`);
        
        doc.moveDown();
        
        if (results.attackSurface.recommendation) {
          doc.fontSize(12)
             .text('Recommendation:', { underline: true });
          doc.fontSize(11)
             .text(results.attackSurface.recommendation);
        }
      }

      // Page break
      doc.addPage();

      // Technical Findings
      doc.fontSize(18)
         .fillColor('#202124')
         .text('TECHNICAL FINDINGS', { underline: true });
      
      doc.moveDown();

      const findings = vulnerabilities.findings || [];
      
      if (findings.length === 0) {
        doc.fontSize(12)
           .fillColor('#5f6368')
           .text('No vulnerabilities detected.');
      } else {
        // Group by severity
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        
        for (const severity of severityOrder) {
          const sevFindings = findings.filter(f => f.severity === severity);
          
          if (sevFindings.length > 0) {
            doc.fontSize(14)
               .fillColor(getRiskColor(severity))
               .text(`${severity.toUpperCase()} SEVERITY (${sevFindings.length})`);
            
            doc.moveDown(0.5);
            
            for (const finding of sevFindings) {
              doc.fontSize(11)
                 .fillColor('#202124')
                 .text(`• ${finding.type || 'Unknown Issue'}`);
              
              doc.fontSize(10)
                 .fillColor('#5f6368')
                 .text(`  Port: ${finding.port || 'N/A'} | Service: ${finding.service || 'N/A'}`);
              doc.text(`  ${finding.description || ''}`);
              
              if (finding.remediation) {
                doc.fillColor('#1a73e8')
                   .text(`  Remediation: ${finding.remediation}`);
              }
              
              doc.fillColor('#5f6368');
              doc.moveDown(0.5);
            }
            
            doc.moveDown();
          }
        }
      }

      // Open Ports Section
      doc.addPage();
      
      doc.fontSize(18)
         .fillColor('#202124')
         .text('OPEN PORTS & SERVICES', { underline: true });
      
      doc.moveDown();

      const services = discovery.openPorts || [];
      
      if (services.length === 0) {
        doc.fontSize(12)
           .fillColor('#5f6368')
           .text('No open ports detected.');
      } else {
        // Table header
        const tableTop = doc.y;
        doc.fontSize(10)
           .fillColor('#5f6368');
        
        doc.text('Port', 50, tableTop);
        doc.text('Service', 120, tableTop);
        doc.text('State', 220, tableTop);
        doc.text('Version', 280, tableTop);
        
        doc.moveTo(50, tableTop + 15)
           .lineTo(550, tableTop + 15)
           .stroke('#e0e0e0');
        
        doc.moveDown();
        
        let yPos = tableTop + 25;
        
        for (const service of services) {
          if (yPos > 750) {
            doc.addPage();
            yPos = 50;
          }
          
          doc.fontSize(10)
             .fillColor('#202124');
          
          doc.text(String(service.port), 50, yPos);
          doc.text(service.service || 'unknown', 120, yPos);
          doc.text(service.state || 'open', 220, yPos);
          doc.text(service.version || service.banner || '-', 280, yPos, { width: 250 });
          
          yPos += 20;
        }
      }

      // Exploit Simulations Section
      if (results.exploits && results.exploits.simulations) {
        doc.addPage();
        
        doc.fontSize(18)
           .fillColor('#202124')
           .text('EXPLOIT SIMULATIONS (EDUCATIONAL)', { underline: true });
        
        doc.moveDown();
        
        doc.fontSize(10)
           .fillColor('#5f6368')
           .text('Note: These are educational simulations demonstrating potential attack vectors.');
        doc.text('No actual exploitation was performed.');
        
        doc.moveDown();
        
        for (const sim of results.exploits.simulations) {
          doc.fontSize(12)
             .fillColor(getRiskColor(sim.severity))
             .text(`• ${sim.name}`);
          
          doc.fontSize(10)
             .fillColor('#5f6368');
          doc.text(`  CVSS: ${sim.cvss || 'N/A'}`);
          doc.text(`  ${sim.description}`);
          
          if (sim.remediation) {
            doc.fillColor('#1a73e8')
               .text(`  Mitigation: ${sim.remediation}`);
          }
          
          doc.fillColor('#5f6368');
          doc.moveDown();
        }
      }

      doc.end();

      stream.on('finish', () => {
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get color for risk level
 */
function getRiskColor(level) {
  const colors = {
    critical: '#d93025',
    high: '#ea4335',
    medium: '#fbbc04',
    low: '#1a73e8',
    info: '#5f6368',
    CRITICAL: '#d93025',
    HIGH: '#ea4335',
    MEDIUM: '#fbbc04',
    LOW: '#1a73e8',
    MINIMAL: '#34a853'
  };
  return colors[level] || '#5f6368';
}

module.exports = {
  generatePDFReport
};
