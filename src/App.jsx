import React, { useState, useEffect, useRef } from 'react';
import { Activity, Wind, Play, Square, Save, Printer, Clock, History, X, AlertTriangle, Wrench } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import io from 'socket.io-client';

const API_BASE_URL = 'https://emission-backend-971414205076.asia-southeast2.run.app/api';
const SOCKET_URL = 'https://emission-backend-971414205076.asia-southeast2.run.app';

const EmissionMonitor = () => {
  const [socket, setSocket] = useState(null);
  const [data, setData] = useState({
    mq135_ppm: 0,
    mq7_ppm: 0,
    status: 'UNSTABLE',
    timestamp: new Date().toISOString()
  });

  const [chartData, setChartData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [testHistory, setTestHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  const [formData, setFormData] = useState({
    nama: '',
    merk_motor: '',
    nama_motor: '',
    cc_motor: '',
    tahun_produksi: '',
    jenis_bahan_bakar: '',
    nomor_wa: ''
  });

  const testStartTime = useRef(null);
  const [testDuration, setTestDuration] = useState(0);
  const durationIntervalRef = useRef(null);

  const parseValidPPM = (value) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) return 0;
    return Math.max(0, Math.min(parsed, 1000));
  };

  const getStatus = (value, sensorName) => {
    const safeValue = parseValidPPM(value);
    
    if (sensorName === 'MQ-135') {
      if (safeValue > 600) {
        return { status: 'BAHAYA', color: 'text-red-500', bg: 'bg-red-900/30', borderColor: 'border-red-500/50' };
      } else if (safeValue > 300) {
        return { status: 'WASPADA', color: 'text-yellow-500', bg: 'bg-yellow-900/30', borderColor: 'border-yellow-500/50' };
      }
      return { status: 'NORMAL', color: 'text-green-500', bg: 'bg-green-900/30', borderColor: 'border-green-500/50' };
    } else {
      if (safeValue > 150) {
        return { status: 'BAHAYA', color: 'text-red-500', bg: 'bg-red-900/30', borderColor: 'border-red-500/50' };
      } else if (safeValue > 75) {
        return { status: 'WASPADA', color: 'text-yellow-500', bg: 'bg-yellow-900/30', borderColor: 'border-yellow-500/50' };
      }
      return { status: 'NORMAL', color: 'text-green-500', bg: 'bg-green-900/30', borderColor: 'border-green-500/50' };
    }
  };

  useEffect(() => {
    console.log('🔌 Connecting to:', SOCKET_URL);
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('✅ Socket connected'));
    newSocket.on('disconnect', () => console.log('❌ Socket disconnected'));

    newSocket.on('connection-status', (status) => {
      console.log('📡 Arduino status:', status);
      setIsConnected(status.connected);
    });

    newSocket.on('sensor-data', (newData) => {
      if (!newData) return;

      const mq135 = parseValidPPM(newData.mq135_ppm);
      const mq7 = parseValidPPM(newData.mq7_ppm);

      const validatedData = {
        mq135_ppm: mq135,
        mq7_ppm: mq7,
        status: newData.status || 'UNSTABLE',
        timestamp: newData.timestamp || new Date().toISOString()
      };

      setData(validatedData);
      
      if (isTesting) {
        const time = new Date().toLocaleTimeString('id-ID', { 
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        
        setChartData(prev => {
          const updated = [...prev, { time, MQ135: mq135, MQ7: mq7 }];
          return updated.slice(-30);
        });
      }
    });

    return () => newSocket.close();
  }, [isTesting]);

  const fetchTestHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/tests`);
      const result = await response.json();
      
      if (result.success) {
        setTestHistory(result.data);
      } else {
        alert('Gagal memuat riwayat: ' + result.error);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Gagal terhubung ke server. Pastikan backend berjalan di http://localhost:3001');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTestHistory();
  }, []);

  const handleStart = () => {
    if (!isConnected) {
      alert('⚠️ Arduino tidak terhubung!\n\nPastikan:\n1. Arduino sudah terhubung ke komputer\n2. Backend server berjalan\n3. Port COM benar');
      return;
    }

    setIsTesting(true);
    setChartData([]);
    testStartTime.current = Date.now();
    
    if (socket) socket.emit('start-test');

    durationIntervalRef.current = setInterval(() => {
      setTestDuration(Math.floor((Date.now() - testStartTime.current) / 1000));
    }, 1000);
  };

  const handleStop = () => {
    setIsTesting(false);
    if (socket) socket.emit('stop-test');
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);

    if (chartData.length === 0) {
      alert('❌ Tidak ada data yang tercatat!\n\nPastikan:\n1. Test berjalan minimal 10 detik\n2. Arduino mengirim data');
      setTestDuration(0);
      return;
    }

    console.log('✅ Test stopped. Data points:', chartData.length);
    setShowForm(true);
  };

  const handleSave = async () => {
    console.log('📝 Validating form data:', formData);
    
    // Validasi KETAT
    const missingFields = [];
    if (!formData.nama) missingFields.push('Nama Pemilik');
    if (!formData.merk_motor) missingFields.push('Merk Motor');
    if (!formData.nama_motor) missingFields.push('Nama Motor');
    if (!formData.cc_motor) missingFields.push('CC');
    if (!formData.tahun_produksi) missingFields.push('Tahun Produksi');
    if (!formData.jenis_bahan_bakar) missingFields.push('Jenis Bahan Bakar');
    if (!formData.nomor_wa) missingFields.push('WhatsApp');

    if (missingFields.length > 0) {
      alert('❌ Mohon lengkapi SEMUA data!\n\nYang masih kosong:\n• ' + missingFields.join('\n• '));
      return;
    }

    if (chartData.length === 0) {
      alert('❌ Tidak ada data test!\n\nMohon jalankan test terlebih dahulu.');
      return;
    }

    try {
      setLoading(true);
      console.log('💾 Saving data to server...');

      const mq135Values = chartData.map(d => d.MQ135);
      const mq7Values = chartData.map(d => d.MQ7);

      const avg_mq135 = parseFloat((mq135Values.reduce((sum, val) => sum + val, 0) / mq135Values.length).toFixed(2));
      const avg_mq7 = parseFloat((mq7Values.reduce((sum, val) => sum + val, 0) / mq7Values.length).toFixed(2));
      const max_mq135 = parseFloat(Math.max(...mq135Values).toFixed(2));
      const max_mq7 = parseFloat(Math.max(...mq7Values).toFixed(2));

      const testResult = {
        nama: formData.nama,
        merk_motor: formData.merk_motor,
        nama_motor: formData.nama_motor,
        cc_motor: parseInt(formData.cc_motor),
        tahun_produksi: parseInt(formData.tahun_produksi),
        jenis_bahan_bakar: formData.jenis_bahan_bakar,
        nomor_wa: formData.nomor_wa,
        test_data: chartData,
        avg_mq135,
        avg_mq7,
        max_mq135,
        max_mq7,
        test_duration: testDuration
      };

      console.log('📤 Sending to API:', testResult);

      const response = await fetch(`${API_BASE_URL}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testResult)
      });

      const result = await response.json();
      console.log('📥 API Response:', result);
      
      if (result.success) {
        alert('✅ Data berhasil disimpan!\n\nID Test: ' + result.id);
        
        // Show recommendations
        if (result.recommendations) {
          setRecommendations(result.recommendations);
          setShowRecommendations(true);
        }
        
        setShowForm(false);
        setFormData({
          nama: '', merk_motor: '', nama_motor: '', cc_motor: '',
          tahun_produksi: '', jenis_bahan_bakar: '', nomor_wa: ''
        });
        setTestDuration(0);
        setChartData([]);
        fetchTestHistory();
      } else {
        throw new Error(result.error || 'Gagal menyimpan data');
      }
    } catch (error) {
      console.error('❌ Save error:', error);
      alert('❌ Gagal menyimpan data:\n\n' + error.message + '\n\nPastikan:\n1. Backend berjalan\n2. Database tersedia\n3. Koneksi internet stabil');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (test) => {
    try {
      setLoading(true);
      console.log('🖨️ Generating PDF for test ID:', test.id);
      
      const response = await fetch(`${API_BASE_URL}/tests/${test.id}/pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emisi-${test.nama.replace(/\s/g, '_')}-${test.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ PDF downloaded successfully');
    } catch (error) {
      console.error('❌ PDF error:', error);
      alert('Gagal generate PDF: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewRecommendations = async (test) => {
    try {
      setLoading(true);
      console.log('📊 Fetching recommendations for test ID:', test.id);
      
      const response = await fetch(`${API_BASE_URL}/tests/${test.id}/recommendations`);
      const result = await response.json();
      
      if (result.success) {
        setRecommendations(result.recommendations);
        setShowRecommendations(true);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Gagal memuat rekomendasi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (testId) => {
    if (!window.confirm('⚠️ Yakin ingin menghapus data ini?\n\nData yang dihapus tidak dapat dikembalikan!')) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/tests/${testId}`, { method: 'DELETE' });
      const result = await response.json();
      
      if (result.success) {
        alert('✅ Data berhasil dihapus!');
        fetchTestHistory();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Delete error:', error);
      alert('Gagal menghapus: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sensors = [
    { 
      name: 'MQ-135', label: 'CO₂/NH₃', value: parseValidPPM(data.mq135_ppm), 
      unit: 'ppm', threshold: '300/600', icon: Wind, color: 'bg-purple-500',
      description: '0-300: Normal | 300-600: Waspada | >600: Bahaya'
    },
    { 
      name: 'MQ-7', label: 'CO', value: parseValidPPM(data.mq7_ppm), 
      unit: 'ppm', threshold: '75/150', icon: Activity, color: 'bg-red-500',
      description: '0-75: Normal | 75-150: Waspada | >150: Bahaya'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Monitor Emisi Kendaraan</h1>
              <p className="text-slate-400">Real-time Emission Detection with AI Recommendations</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => { fetchTestHistory(); setShowHistory(!showHistory); }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <History className="w-5 h-5" />
                Riwayat ({testHistory.length})
              </button>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                <span className="text-white">{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
          </div>

          {/* Control */}
          <div className="flex items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
            {!isTesting ? (
              <button
                onClick={handleStart}
                disabled={!isConnected || loading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
              >
                <Play className="w-5 h-5" />
                Mulai Test
              </button>
            ) : (
              <>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                >
                  <Square className="w-5 h-5" />
                  Stop Test
                </button>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-mono">{formatDuration(testDuration)}</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-900 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                  <span className="text-blue-300 text-sm">Recording... ({chartData.length} points)</span>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  data.status === 'STABLE' ? 'bg-green-900' : 'bg-yellow-900'
                }`}>
                  <span className={`text-sm font-semibold ${
                    data.status === 'STABLE' ? 'text-green-300' : 'text-yellow-300'
                  }`}>{data.status}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recommendations Modal */}
        {showRecommendations && recommendations && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Wrench className="w-7 h-7 text-yellow-500" />
                  Rekomendasi Perbaikan & Perawatan
                </h2>
                <button onClick={() => setShowRecommendations(false)} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Overall Status */}
              <div className={`p-4 rounded-xl mb-6 ${
                recommendations.overallStatus === 'CRITICAL' ? 'bg-red-900/30 border-2 border-red-500' :
                recommendations.overallStatus === 'WARNING' ? 'bg-yellow-900/30 border-2 border-yellow-500' :
                'bg-green-900/30 border-2 border-green-500'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-lg">Status: {recommendations.overallStatus}</p>
                    <p className="text-slate-300 text-sm">Service Berikutnya: {recommendations.nextServiceRecommended}</p>
                  </div>
                  {recommendations.estimatedTotalCost > 0 && (
                    <div className="text-right">
                      <p className="text-slate-400 text-sm">Estimasi Biaya Total</p>
                      <p className="text-white font-bold text-xl">Rp {recommendations.estimatedTotalCost.toLocaleString('id-ID')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Urgent Issues */}
              {recommendations.urgentIssues.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-red-400 mb-3">⚠️ Masalah Mendesak</h3>
                  <div className="space-y-2">
                    {recommendations.urgentIssues.map((issue, idx) => (
                      <div key={idx} className="bg-red-900/20 border border-red-500/30 p-3 rounded-lg">
                        <p className="text-red-300">{issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {recommendations.recommendations.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-yellow-400 mb-3">🔧 Rekomendasi Perbaikan</h3>
                  <div className="space-y-4">
                    {recommendations.recommendations.map((rec, idx) => (
                      <div key={idx} className="bg-slate-700 p-4 rounded-xl">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="text-white font-bold text-lg">{rec.issue}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            rec.priority === 'CRITICAL' ? 'bg-red-500 text-white' :
                            rec.priority === 'URGENT' ? 'bg-orange-500 text-white' :
                            rec.priority === 'HIGH' ? 'bg-yellow-500 text-black' : 'bg-blue-500 text-white'
                          }`}>{rec.priority}</span>
                        </div>
                        
                        <div className="mb-3">
                          <p className="text-slate-300 font-semibold mb-2">Penyebab:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {rec.causes.map((cause, i) => (
                              <li key={i} className="text-slate-400 text-sm">{cause}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="mb-3">
                          <p className="text-slate-300 font-semibold mb-2">Tindakan:</p>
                          <ul className="space-y-1">
                            {rec.actions.map((action, i) => (
                              <li key={i} className="text-slate-300 text-sm">{action}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-600">
                          <div>
                            <p className="text-green-400 font-semibold">💰 {rec.estimatedCost}</p>
                            {rec.workshopRecommended && (
                              <p className="text-slate-400 text-xs mt-1">📍 {rec.workshopRecommended}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preventive Actions */}
              {recommendations.preventiveActions.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-blue-400 mb-3">💡 Perawatan Preventif</h3>
                  <div className="space-y-3">
                    {recommendations.preventiveActions.map((action, idx) => (
                      <div key={idx} className="bg-slate-700/50 p-4 rounded-lg">
                        <p className="text-white font-semibold mb-2">{action.category}</p>
                        <ul className="space-y-1">
                          {action.items.map((item, i) => (
                            <li key={i} className="text-slate-300 text-sm">{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Riwayat Test</h2>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
                  <p className="text-slate-400 mt-4">Loading...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {testHistory.map((test) => {
                    const status135 = getStatus(test.avg_mq135, 'MQ-135');
                    const status7 = getStatus(test.avg_mq7, 'MQ-7');
                    
                    return (
                      <div key={test.id} className="bg-slate-700 rounded-xl p-4 border border-slate-600">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div>
                            <p className="text-slate-400 text-sm">Nama</p>
                            <p className="text-white font-semibold">{test.nama}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-sm">Motor</p>
                            <p className="text-white font-semibold">{test.merk_motor} {test.nama_motor}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-sm">CC / Tahun</p>
                            <p className="text-white font-semibold">{test.cc_motor}cc / {test.tahun_produksi || '-'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-sm">Bahan Bakar</p>
                            <p className="text-white font-semibold">{test.jenis_bahan_bakar || '-'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 text-sm">Tanggal</p>
                            <p className="text-white font-semibold">{new Date(test.timestamp).toLocaleDateString('id-ID')}</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className={`p-3 rounded-lg border ${status135.bg} ${status135.borderColor}`}>
                            <p className="text-slate-400 text-xs">Avg MQ-135 (CO₂/NH₃)</p>
                            <p className={`font-bold text-lg ${status135.color}`}>
                              {parseFloat(test.avg_mq135).toFixed(1)} ppm
                            </p>
                            <p className={`text-xs font-semibold ${status135.color}`}>{status135.status}</p>
                          </div>
                          <div className={`p-3 rounded-lg border ${status7.bg} ${status7.borderColor}`}>
                            <p className="text-slate-400 text-xs">Avg MQ-7 (CO)</p>
                            <p className={`font-bold text-lg ${status7.color}`}>
                              {parseFloat(test.avg_mq7).toFixed(1)} ppm
                            </p>
                            <p className={`text-xs font-semibold ${status7.color}`}>{status7.status}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3 flex-wrap">
                          <button
                            onClick={() => handleViewRecommendations(test)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                          >
                            <Wrench className="w-4 h-4" />
                            Rekomendasi
                          </button>
                          <button
                            onClick={() => handlePrint(test)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                            Print PDF
                          </button>
                          <button
                            onClick={() => handleDelete(test.id)}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Hapus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {testHistory.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-slate-400">Belum ada data test</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-white mb-6">Data Pemilik & Kendaraan</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 mb-2">Nama Pemilik *</label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => setFormData({...formData, nama: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: Ahmad Suryanto"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Merk Motor *</label>
                  <input
                    type="text"
                    value={formData.merk_motor}
                    onChange={(e) => setFormData({...formData, merk_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: Honda"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Nama Motor *</label>
                  <input
                    type="text"
                    value={formData.nama_motor}
                    onChange={(e) => setFormData({...formData, nama_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: Vario 160"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">CC *</label>
                  <input
                    type="number"
                    value={formData.cc_motor}
                    onChange={(e) => setFormData({...formData, cc_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: 160"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Tahun Produksi *</label>
                  <input
                    type="number"
                    value={formData.tahun_produksi}
                    onChange={(e) => setFormData({...formData, tahun_produksi: e.target.value})}
                    placeholder="Contoh: 2023"
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Jenis Bahan Bakar *</label>
                  <select
                    value={formData.jenis_bahan_bakar}
                    onChange={(e) => setFormData({...formData, jenis_bahan_bakar: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Bahan Bakar --</option>
                    <option value="Bensin">Bensin (Premium/Pertalite)</option>
                    <option value="Pertalite">Pertalite</option>
                    <option value="Pertamax">Pertamax</option>
                    <option value="Pertamax Turbo">Pertamax Turbo</option>
                    <option value="Solar">Solar</option>
                    <option value="Listrik">Listrik</option>
                  </select>
                </div>
                
                <div className="col-span-2">
                  <label className="block text-slate-300 mb-2">WhatsApp *</label>
                  <input
                    type="tel"
                    value={formData.nomor_wa}
                    onChange={(e) => setFormData({...formData, nomor_wa: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: 081234567890"
                  />
                </div>
              </div>
              
              <p className="text-slate-400 text-sm mt-4 mb-4">* Wajib diisi semua</p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                >
                  <Save className="w-5 h-5" />
                  {loading ? 'Menyimpan...' : 'Simpan Data'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  disabled={loading}
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-semibold"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {isTesting && (
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 mb-6">
            <h3 className="text-xl font-bold text-white mb-4">Real-time Chart ({chartData.length} points)</h3>
            {chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p className="text-slate-400">Waiting for data...</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                  <Legend />
                  <Line type="monotone" dataKey="MQ135" stroke="#a855f7" strokeWidth={2} dot={false} name="MQ-135 (ppm)" />
                  <Line type="monotone" dataKey="MQ7" stroke="#ef4444" strokeWidth={2} dot={false} name="MQ-7 (ppm)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Sensors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sensors.map((sensor) => {
            const status = getStatus(sensor.value, sensor.name);
            const Icon = sensor.icon;
            
            return (
              <div key={sensor.name} className={`bg-slate-800 rounded-2xl p-6 border-2 ${status.borderColor}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 ${sensor.color} rounded-xl`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 ${status.bg} ${status.borderColor}`}>
                    <span className={`text-sm font-bold ${status.color}`}>{status.status}</span>
                  </div>
                </div>
                
                <h3 className="text-slate-400 text-sm mb-1">{sensor.name}</h3>
                <p className="text-slate-300 text-xs mb-3">{sensor.label}</p>
                
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-5xl font-bold text-white">{sensor.value.toFixed(1)}</span>
                  <span className="text-slate-400 text-lg">{sensor.unit}</span>
                </div>
                
                <div className="bg-slate-900 p-3 rounded-lg space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Threshold: {sensor.threshold} {sensor.unit}</span>
                  </div>
                  <p className="text-xs text-slate-600">{sensor.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EmissionMonitor;