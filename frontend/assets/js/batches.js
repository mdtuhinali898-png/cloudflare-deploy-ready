// assets/js/batches.js

document.addEventListener('DOMContentLoaded', () => {
    
// ============================================
// 1. CONFIG & STATE
// ============================================
// Use relative URL if accessed through server, otherwise use localhost
const API_BASE_URL = window.location.protocol === 'http:' && window.location.hostname === 'localhost' 
    ? 'http://localhost:5002/api' 
    : '/api';
    
    let batchesData = [];
    let studentsData = [];
    let paymentsData = [];
    let overviewStats = null;
    let editingBatchId = null;
    let charts = {};

    // ============================================
    // 2. DATA LOADING FROM DATABASE
    // ============================================
    async function loadData() {
        try {
            // Fetch batches from database
            const batchesResponse = await fetch(`${API_BASE_URL}/batches`);
            const batchesResult = await batchesResponse.json();
            
            if (batchesResult.success) {
                batchesData = batchesResult.data;
            } else {
                console.error('Failed to load batches:', batchesResult.message);
                batchesData = [];
            }
            
            // Fetch every student page. The database can contain more than the
            // first 1,000 records, which otherwise makes older batches appear empty.
            const studentsResponse = await fetch(`${API_BASE_URL}/students?limit=1000&page=1`);
            if (!studentsResponse.ok) throw new Error(`Students request failed (${studentsResponse.status})`);
            const studentsResult = await studentsResponse.json();
            
            if (studentsResult.success || studentsResult.students) {
                studentsData = studentsResult.students || studentsResult.data || [];
                const totalPages = Number(studentsResult.totalPages || 1);
                if (totalPages > 1) {
                    const remainingPages = await Promise.all(Array.from({ length: totalPages - 1 }, async (_, index) => {
                        const page = index + 2;
                        const response = await fetch(`${API_BASE_URL}/students?limit=1000&page=${page}`);
                        if (!response.ok) throw new Error(`Students page ${page} request failed (${response.status})`);
                        const result = await response.json();
                        if (!result.success) throw new Error(result.message || `Students page ${page} failed`);
                        return result.students || result.data || [];
                    }));
                    studentsData = studentsData.concat(...remainingPages);
                }
            } else {
                console.error('Failed to load students:', studentsResult.message);
                studentsData = [];
            }
            
            // Fetch payments from database
            try {
                const paymentsResponse = await fetch(`${API_BASE_URL}/payments?limit=1000`);
                const paymentsResult = await paymentsResponse.json();
                paymentsData = paymentsResult.payments || paymentsResult.data || [];
            } catch (paymentError) {
                console.log('Payment collection not available yet:', paymentError.message);
                paymentsData = [];
            }

            try {
                const statsResponse = await fetch(`${API_BASE_URL}/batches/stats/overview`);
                const statsResult = await statsResponse.json();
                overviewStats = statsResponse.ok && statsResult.success ? statsResult.data : null;
            } catch (statsError) {
                console.error('Failed to load exact batch summary:', statsError);
                overviewStats = null;
            }
            
            updateStats();
            renderBatchTable();
            renderCharts();
            
        } catch (error) {
            console.error('Error loading data:', error);
            alert('❌ Failed to load data from database. Please ensure the backend server is running.');
        }
    }

    // ============================================
    // 3. CALCULATE BATCH STATISTICS
    // ============================================
    function getBatchStats(batchName) {
        const normalizeBatchName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
        const batchKey = normalizeBatchName(batchName);
        const batchStudents = studentsData.filter(s => normalizeBatchName(s.batch) === batchKey);
        const studentIds = batchStudents.map(s => s.studentId);
        const batchPayments = paymentsData.filter(p => studentIds.includes(p.studentId));
        
        const totalStudents = batchStudents.length;
        const activeStudents = batchStudents.filter(s => s.status === 'Active').length;
        const expected = totalStudents * (batchStudents[0]?.fee || 0);
        const collected = batchPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const due = Math.max(0, expected - collected);
        const rate = expected > 0 ? ((collected / expected) * 100).toFixed(1) : 0;
        
        return {
            totalStudents,
            activeStudents,
            expected,
            collected,
            due,
            rate
        };
    }

    // ============================================
    // 3.1 SORT STUDENTS BY NUMERIC ID
    // ============================================
    // Sorts students by numeric part of studentId (B1, B2, ... B9, B10, B100, B128)
    function sortStudentsById(students) {
        return [...students].sort((a, b) => {
            const numA = parseInt(a.studentId.replace(/[^0-9]/g, ''), 10) || 0;
            const numB = parseInt(b.studentId.replace(/[^0-9]/g, ''), 10) || 0;
            return numA - numB;
        });
    }

    // ============================================
    // 4. UPDATE STATISTICS CARDS
    // ============================================
    function updateStats() {
        const totalBatches = overviewStats?.totalBatches ?? batchesData.length;
        const totalStudents = overviewStats?.totalStudents ?? studentsData.length;
        const totalCollection = overviewStats?.totalCollection ?? paymentsData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        // Calculate total due
        let totalDue = overviewStats?.totalDue;
        if (totalDue === undefined) {
            totalDue = 0;
            batchesData.forEach(batch => {
                const stats = getBatchStats(batch.name);
                totalDue += stats.due;
            });
        }
        
        document.getElementById('totalBatches').innerText = totalBatches;
        document.getElementById('totalStudentsInBatches').innerText = totalStudents;
        document.getElementById('totalCollection').innerText = '৳' + Number(totalCollection).toLocaleString();
        document.getElementById('totalDue').innerText = '৳' + Number(totalDue).toLocaleString();
    }

    // ============================================
    // 5. RENDER BATCH TABLE
    // ============================================
    function renderBatchTable() {
        const filterStatus = document.getElementById('filterStatus').value;
        const filteredBatches = filterStatus === 'all' 
            ? batchesData 
            : batchesData.filter(b => b.status === filterStatus);
        
        const tbody = document.getElementById('batchTableBody');
        tbody.innerHTML = '';
        
        if (filteredBatches.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; color:#888;">No batches found.</td></tr>`;
            return;
        }
        
        filteredBatches.forEach((batch) => {
            const stats = getBatchStats(batch.name);
            
            const row = `
                <tr>
                    <td><strong>${batch.name}</strong></td>
                    <td>${batch.year}</td>
                    <td>${stats.totalStudents}</td>
                    <td>৳${batch.fee}</td>
                    <td>৳${stats.expected.toLocaleString()}</td>
                    <td>৳${stats.collected.toLocaleString()}</td>
                    <td>৳${stats.due.toLocaleString()}</td>
                    <td>${stats.rate}%</td>
                    <td><span class="status-badge status-${batch.status.toLowerCase()}">${batch.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="btn-view" onclick="viewBatch('${batch._id}')" title="View Details"><i class="fas fa-eye"></i></button>
                            <button class="btn-edit" onclick="editBatch('${batch._id}')" title="Edit"><i class="fas fa-edit"></i></button>
                            <button class="btn-excel" onclick="exportBatchToExcel('${batch._id}')" title="Export to Excel"><i class="fas fa-file-excel"></i></button>
                            <button class="btn-print" onclick="printBatch('${batch._id}')" title="Print"><i class="fas fa-print"></i></button>
                            <button class="btn-delete" onclick="deleteBatch('${batch._id}')" title="Delete"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    }

    // ============================================
    // 6. RENDER CHARTS
    // ============================================
    function renderCharts() {
        // Students per Batch (Doughnut)
        const batchNames = batchesData.map(b => b.name);
        const studentCounts = batchNames.map(name => getBatchStats(name).totalStudents);
        
        if (charts.batchStudents) charts.batchStudents.destroy();
        const ctx1 = document.getElementById('batchStudentsChart').getContext('2d');
        charts.batchStudents = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: batchNames,
                datasets: [{
                    data: studentCounts,
                    backgroundColor: ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b', '#858796'],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
        
        // Collection per Batch (Bar)
        const collections = batchNames.map(name => getBatchStats(name).collected);
        
        if (charts.batchCollection) charts.batchCollection.destroy();
        const ctx2 = document.getElementById('batchCollectionChart').getContext('2d');
        charts.batchCollection = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: batchNames,
                datasets: [{
                    label: 'Collection (৳)',
                    data: collections,
                    backgroundColor: '#4e73df',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => '৳' + v }
                    }
                }
            }
        });
    }

    // ============================================
    // 7. MODAL FUNCTIONS
    // ============================================
    window.openAddBatchModal = () => {
        editingBatchId = null;
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Batch';
        document.getElementById('saveBatchBtn').innerHTML = '<i class="fas fa-save"></i> Save Batch';
        document.getElementById('batchForm').reset();
        document.getElementById('batchFee').value = 1500;
        document.getElementById('batchModal').classList.add('active');
    };

    window.closeBatchModal = () => {
        document.getElementById('batchModal').classList.remove('active');
    };

    window.closeViewBatchModal = () => {
        document.getElementById('viewBatchModal').classList.remove('active');
    };

    window.editBatch = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/batches/${batchId}`);
            const result = await response.json();
            
            if (!result.success) {
                alert('❌ Failed to fetch batch details: ' + result.message);
                return;
            }
            
            const batch = result.data;
            editingBatchId = batchId;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Batch';
            document.getElementById('saveBatchBtn').innerHTML = '<i class="fas fa-save"></i> Update Batch';
            
            document.getElementById('batchName').value = batch.name;
            document.getElementById('batchYear').value = batch.year;
            document.getElementById('batchPrefix').value = batch.prefix || '';
            document.getElementById('batchFee').value = batch.fee;
            document.getElementById('batchDescription').value = batch.description || '';
            document.getElementById('batchStatus').value = batch.status;
            
            document.getElementById('batchModal').classList.add('active');
        } catch (error) {
            console.error('Error fetching batch:', error);
            alert('❌ Failed to fetch batch details');
        }
    };

    window.viewBatch = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/batches/${batchId}`);
            const result = await response.json();
            
            if (!result.success) {
                alert('❌ Failed to fetch batch details: ' + result.message);
                return;
            }
            
            const batch = result.data;
            const stats = getBatchStats(batch.name);
            const batchStudents = sortStudentsById(studentsData.filter(s => s.batch === batch.name));
            
            let studentsListHTML = '';
            if (batchStudents.length > 0) {
                studentsListHTML = `
                    <div class="batch-students-list">
                        <h4><i class="fas fa-users"></i> Students in this Batch (${batchStudents.length})</h4>
                        <table class="student-mini-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Fee</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${batchStudents.map(s => `
                                    <tr>
                                        <td>${s.studentId}</td>
                                        <td>${s.name}</td>
                                        <td>${s.phone}</td>
                                        <td>৳${s.fee}</td>
                                        <td><span class="status-badge status-${s.status.toLowerCase()}">${s.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                studentsListHTML = '<p style="text-align:center; color:#888; padding:20px;">No students in this batch yet.</p>';
            }
            
            const content = `
                <div class="batch-details-grid">
                    <div class="detail-item">
                        <label>Batch Name</label>
                        <strong>${batch.name}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Year</label>
                        <strong>${batch.year}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Monthly Fee</label>
                        <strong>৳${batch.fee}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Total Students</label>
                        <strong>${stats.totalStudents}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Expected Collection</label>
                        <strong>৳${stats.expected.toLocaleString()}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Collected</label>
                        <strong>৳${stats.collected.toLocaleString()}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Due Amount</label>
                        <strong>৳${stats.due.toLocaleString()}</strong>
                    </div>
                    <div class="detail-item">
                        <label>Collection Rate</label>
                        <strong>${stats.rate}%</strong>
                    </div>
                </div>
                ${batch.description ? `<p style="color:#666; font-size:13px; margin-bottom:15px;"><strong>Description:</strong> ${batch.description}</p>` : ''}
                <div style="display:flex; gap:10px; margin-top:15px; margin-bottom:20px;">
                    <button class="btn-primary" onclick="exportBatchToExcel('${batch._id}')" style="flex:1; padding:10px; font-size:13px;">
                        <i class="fas fa-file-excel"></i> Export to Excel
                    </button>
                    <button class="btn-primary" onclick="printBatch('${batch._id}')" style="flex:1; padding:10px; font-size:13px; background:#6c757d;">
                        <i class="fas fa-print"></i> Print Details
                    </button>
                </div>
                ${studentsListHTML}
            `;
            
            document.getElementById('viewBatchContent').innerHTML = content;
            document.getElementById('viewBatchModal').classList.add('active');
        } catch (error) {
            console.error('Error fetching batch:', error);
            alert('❌ Failed to fetch batch details');
        }
    };

    window.deleteBatch = async (batchId) => {
        const batch = batchesData.find(b => b._id === batchId);
        if (!batch) return;
        
        const stats = getBatchStats(batch.name);
        
        if (stats.totalStudents > 0) {
            alert(`❌ Cannot delete batch "${batch.name}" because it has ${stats.totalStudents} students. Please reassign or remove students first.`);
            return;
        }
        
        if (confirm(`Are you sure you want to delete batch "${batch.name}"?`)) {
            try {
                const response = await fetch(`${API_BASE_URL}/batches/${batchId}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    batchesData = batchesData.filter(b => b._id !== batchId);
                    renderBatchTable();
                    updateStats();
                    renderCharts();
                    alert('✅ Batch deleted successfully!');
                } else {
                    alert('❌ Failed to delete batch: ' + result.message);
                }
            } catch (error) {
                console.error('Error deleting batch:', error);
                alert('❌ Failed to delete batch');
            }
        }
    };

    // ============================================
    // 8. FORM SUBMISSION
    // ============================================
    document.getElementById('batchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const batchData = {
            name: document.getElementById('batchName').value.trim(),
            year: parseInt(document.getElementById('batchYear').value),
            prefix: document.getElementById('batchPrefix').value.trim().toUpperCase(),
            fee: parseFloat(document.getElementById('batchFee').value) || 1500,
            description: document.getElementById('batchDescription').value.trim(),
            status: document.getElementById('batchStatus').value
        };
        
        try {
            let response;
            
            if (editingBatchId) {
                // Update existing batch
                response = await fetch(`${API_BASE_URL}/batches/${editingBatchId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batchData)
                });
            } else {
                // Add new batch
                response = await fetch(`${API_BASE_URL}/batches`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(batchData)
                });
            }
            
            const result = await response.json();
            
            if (result.success) {
                if (editingBatchId) {
                    // Update local data
                    const index = batchesData.findIndex(b => b._id === editingBatchId);
                    if (index !== -1) {
                        batchesData[index] = result.data;
                    }
                    alert('✅ Batch updated successfully!');
                } else {
                    // Add to local data
                    batchesData.push(result.data);
                    alert('✅ Batch added successfully!');
                }
                
                closeBatchModal();
                renderBatchTable();
                updateStats();
                renderCharts();
            } else {
                alert('❌ ' + result.message);
            }
        } catch (error) {
            console.error('Error saving batch:', error);
            alert('❌ Failed to save batch. Please ensure the backend server is running.');
        }
    });

    // ============================================
    // 9. FILTER
    // ============================================
    document.getElementById('filterStatus').addEventListener('change', renderBatchTable);

    // ============================================
    // 10. SIDEBAR TOGGLE
    // ============================================
const sidebarToggle = document.getElementById('sidebarToggle');
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('active');
    });
}

    // ============================================
    // 10. EXPORT TO EXCEL
    // ============================================
    window.exportAllBatchesToExcel = () => {
        const batchSummary = batchesData.map(batch => {
            const stats = getBatchStats(batch.name);
            return {
                batch: batch.name,
                year: batch.year,
                totalStudents: stats.totalStudents,
                active: stats.active,
                fee: batch.fee,
                expected: stats.expected,
                collected: stats.collected,
                due: stats.due,
                rate: stats.rate + '%'
            };
        });

        let csvContent = 'Batch Name,Year,Total Students,Active,Monthly Fee,Expected Collection,Collected,Due,Collection Rate\n';
        
        batchSummary.forEach(b => {
            const row = [
                `"${b.batch}"`,
                b.year,
                b.totalStudents,
                b.active,
                b.fee,
                b.expected,
                b.collected,
                b.due,
                b.rate
            ].join(',');
            csvContent += row + '\n';
        });

        downloadCSV(csvContent, 'all_batches_report.csv');
    };

    function downloadCSV(csvContent, filename) {
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // ============================================
    // 11. EXPORT INDIVIDUAL BATCH TO EXCEL
    // ============================================
    window.exportBatchToExcel = (batchId) => {
        const batch = batchesData.find(b => b._id === batchId);
        if (!batch) {
            alert('❌ Batch not found');
            return;
        }

        const stats = getBatchStats(batch.name);
        const batchStudents = sortStudentsById(studentsData.filter(s => s.batch === batch.name));

        // Create header
        let csvContent = 'BATCH DETAILS REPORT\n\n';
        csvContent += `Batch Name,${batch.name}\n`;
        csvContent += `Year,${batch.year}\n`;
        csvContent += `Monthly Fee,৳${batch.fee}\n`;
        csvContent += `Status,${batch.status}\n`;
        csvContent += `Description,${batch.description || 'N/A'}\n\n`;

        csvContent += 'STATISTICS\n';
        csvContent += `Total Students,${stats.totalStudents}\n`;
        csvContent += `Active Students,${stats.activeStudents}\n`;
        csvContent += `Expected Collection,৳${stats.expected.toLocaleString()}\n`;
        csvContent += `Collected Amount,৳${stats.collected.toLocaleString()}\n`;
        csvContent += `Due Amount,৳${stats.due.toLocaleString()}\n`;
        csvContent += `Collection Rate,${stats.rate}%\n\n`;

        // Add students list
        csvContent += 'STUDENTS LIST\n';
        csvContent += 'Student ID,Name,Phone,Fee,Status\n';

        batchStudents.forEach(student => {
            csvContent += `"${student.studentId}","${student.name}","${student.phone}",৳${student.fee},${student.status}\n`;
        });

        const filename = `${batch.name.replace(/\s+/g, '_')}_details.csv`;
        downloadCSV(csvContent, filename);
    };

    // ============================================
    // 12. PRINT BATCH DETAILS
    // ============================================
    window.printBatch = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/batches/${batchId}`);
            const result = await response.json();
            
            if (!result.success) {
                alert('❌ Failed to fetch batch details');
                return;
            }

            const batch = result.data;
            const stats = getBatchStats(batch.name);
            const batchStudents = sortStudentsById(studentsData.filter(s => s.batch === batch.name));

            // Create a new window for printing
            const printWindow = window.open('', '_blank', 'width=800,height=600');
            
            const currentDate = new Date().toLocaleDateString('en-BD', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            const studentsRows = batchStudents.map((student, index) => `
                <tr>
                    <td>${student.studentId || 'A' + (index + 1)}</td>
                    <td>${student.name}</td>
                    <td>${student.phone}</td>
                    <td>৳${student.fee}</td>
                    <td>${student.status}</td>
                </tr>
            `).join('');

            const printContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${batch.name} - Batch Details</title>
                    <style>
                        @page {
                            size: A4;
                            margin: 12mm;
                        }
                        
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            padding: 12px;
                            font-size: 9pt;
                            color: #2c3e50;
                            line-height: 1.4;
                        }
                        
                        .header {
                            text-align: center;
                            border-bottom: 1px solid #2c3e50;
                            padding-bottom: 8px;
                            margin-bottom: 12px;
                        }
                        
                        .header h1 {
                            font-size: 13pt;
                            font-weight: 700;
                            margin-bottom: 2px;
                            color: #1a2a3a;
                        }
                        
                        .header p {
                            font-size: 8pt;
                            color: #7f8c8d;
                        }
                        
                        .info-section {
                            margin-bottom: 10px;
                        }
                        
                        .info-section h2 {
                            font-size: 10pt;
                            font-weight: 600;
                            color: #2c3e50;
                            border-bottom: 1px solid #bdc3c7;
                            padding-bottom: 3px;
                            margin-bottom: 5px;
                        }
                        
                        .info-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 4px;
                        }
                        
                        .info-item {
                            padding: 3px 5px;
                            border-bottom: 1px solid #ecf0f1;
                        }
                        
                        .info-item label {
                            font-weight: 600;
                            display: block;
                            font-size: 7.5pt;
                            color: #7f8c8d;
                            text-transform: uppercase;
                            letter-spacing: 0.2px;
                            margin-bottom: 1px;
                        }
                        
                        .info-item strong {
                            font-size: 9pt;
                            color: #2c3e50;
                        }
                        
                        .stats-section {
                            margin-bottom: 10px;
                        }
                        
                        .stats-grid {
                            display: grid;
                            grid-template-columns: repeat(3, 1fr);
                            gap: 4px;
                            margin-top: 5px;
                        }
                        
                        .stat-box {
                            border: 1px solid #bdc3c7;
                            padding: 5px;
                            text-align: center;
                            border-radius: 3px;
                        }
                        
                        .stat-box .label {
                            font-size: 7pt;
                            color: #95a5a6;
                            text-transform: uppercase;
                            letter-spacing: 0.2px;
                            margin-bottom: 1px;
                        }
                        
                        .stat-box .value {
                            font-size: 10pt;
                            font-weight: 700;
                            color: #2c3e50;
                        }
                        
                        .students-section {
                            margin-bottom: 10px;
                        }
                        
                        .students-heading {
                            font-size: 10pt;
                            font-weight: 600;
                            color: #2c3e50;
                            border-bottom: 1px solid #bdc3c7;
                            padding-bottom: 3px;
                            margin-bottom: 5px;
                        }
                        
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 5px;
                            font-size: 9pt;
                        }
                        
                        table thead {
                            background: #2c3e50;
                            color: white;
                        }
                        
                        table th {
                            padding: 4px 6px;
                            text-align: left;
                            font-weight: 600;
                            text-transform: uppercase;
                            font-size: 7.5pt;
                            letter-spacing: 0.2px;
                        }
                        
                        table td {
                            padding: 3px 6px;
                            border-bottom: 1px solid #ecf0f1;
                        }
                        
                        table tbody tr:nth-child(even) {
                            background: #f8f9fa;
                        }
                        
                        .footer {
                            margin-top: 15px;
                            padding-top: 8px;
                            border-top: 1px solid #bdc3c7;
                            text-align: center;
                            font-size: 7.5pt;
                            color: #95a5a6;
                        }
                        
                        @media print {
                            body {
                                padding: 12px;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${batch.name}</h1>
                        <p>Batch Details Report | Generated on ${currentDate}</p>
                    </div>

                    <div class="info-section">
                        <h2>Batch Information</h2>
                        <div class="info-grid">
                            <div class="info-item">
                                <label>Batch Name</label>
                                <strong>${batch.name}</strong>
                            </div>
                            <div class="info-item">
                                <label>Year</label>
                                <strong>${batch.year}</strong>
                            </div>
                            <div class="info-item">
                                <label>Monthly Fee</label>
                                <strong>৳${batch.fee}</strong>
                            </div>
                            <div class="info-item">
                                <label>Status</label>
                                <strong>${batch.status}</strong>
                            </div>
                            ${batch.description ? `
                            <div class="info-item" style="grid-column: 1 / -1;">
                                <label>Description</label>
                                <strong>${batch.description}</strong>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="stats-section">
                        <h2>Financial Summary</h2>
                        <div class="stats-grid">
                            <div class="stat-box">
                                <div class="label">Total Students</div>
                                <div class="value">${stats.totalStudents}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Active Students</div>
                                <div class="value">${stats.activeStudents}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Collection Rate</div>
                                <div class="value">${stats.rate}%</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Expected</div>
                                <div class="value">৳${stats.expected.toLocaleString()}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Collected</div>
                                <div class="value">৳${stats.collected.toLocaleString()}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Due Amount</div>
                                <div class="value">৳${stats.due.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    <div class="students-section">
                        <h2 class="students-heading">Students List - ${batch.name} (${batchStudents.length} Students)</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 8%;">ID</th>
                                    <th>Student Name</th>
                                    <th>Phone Number</th>
                                    <th>Monthly Fee</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${studentsRows || '<tr><td colspan="5" style="text-align:center; padding:8px;">No students in this batch</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <div class="footer">
                        <p>© 2026 Student ERP Management System | Developed by Tuhin Ali</p>
                    </div>
                </body>
                </html>
            `;

            printWindow.document.write(printContent);
            printWindow.document.close();
            
            // Wait for content to load then print
            setTimeout(() => {
                printWindow.print();
            }, 500);
        } catch (error) {
            console.error('Error printing batch:', error);
            alert('❌ Failed to print batch details');
        }
    };

    // ============================================
    // 13. INITIALIZE
    // ============================================
    loadData();
});
