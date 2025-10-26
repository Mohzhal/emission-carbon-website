import React, { useState, useEffect, useRef } from 'react';
import { Activity, Wind, Play, Square, Save, Printer, Clock, History, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3001/api';
const SOCKET_URL = 'http://localhost:3001';

const EmissionMonitor = () => {
  const [socket, setSocket] = useState(null);
  const [data, setData] = useState({
    mq135_ppm: 0,
    mq7_ppm: 0,
    timestamp: new Date().toISOString()
  });

  const [chartData, setChartData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [testHistory, setTestHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    nama: '',
    merk_motor: '',
    nama_motor: '',
    cc_motor: '',
    nomor_wa: ''
  });

  const testStartTime = useRef(null);
  const [testDuration, setTestDuration] = useState(0);
  const durationIntervalRef = useRef(null);

  // Fungsi untuk validasi dan parse PPM
  const parseValidPPM = (value) => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.max(0, parsed);
  };

  // Initialize Socket.IO connection
  useEffect(() => {
    console.log('🔌 Connecting to socket:', SOCKET_URL);
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    newSocket.on('connection-status', (status) => {
      console.log('📡 Arduino status:', status);
      setIsConnected(status.connected);
    });

    newSocket.on('sensor-data', (newData) => {
      console.log('📊 Raw sensor data:', newData);
      
      if (!newData) {
        console.warn('⚠️ Received null/undefined data');
        return;
      }

      // Parse dan validasi data dari backend
      const mq135 = parseValidPPM(newData.mq135_ppm);
      const mq7 = parseValidPPM(newData.mq7_ppm);

      const validatedData = {
        mq135_ppm: mq135,
        mq7_ppm: mq7,
        timestamp: newData.timestamp || new Date().toISOString()
      };

      console.log('✅ Validated data:', validatedData);
      setData(validatedData);
      
      // Tambahkan ke chart jika sedang testing
      if (isTesting) {
        const time = new Date().toLocaleTimeString('id-ID', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          hour12: false
        });
        
        const chartPoint = {
          time,
          MQ135: mq135,
          MQ7: mq7
        };

        console.log('📈 Adding to chart:', chartPoint);
        
        setChartData(prev => {
          const updated = [...prev, chartPoint];
          // Simpan maksimal 30 data point
          return updated.slice(-30);
        });
      }
    });

    return () => {
      console.log('🔌 Closing socket connection');
      newSocket.close();
    };
  }, [isTesting]);

  // Fetch test history
  const fetchTestHistory = async () => {
    try {
      setLoading(true);
      console.log('📋 Fetching test history...');
      const response = await fetch(`${API_BASE_URL}/tests`);
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Test history loaded:', result.data.length, 'records');
        setTestHistory(result.data);
      } else {
        console.error('❌ Failed to load history:', result.error);
      }
    } catch (error) {
      console.error('❌ Error fetching test history:', error);
      alert('Gagal memuat riwayat: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load test history on mount
  useEffect(() => {
    fetchTestHistory();
  }, []);

  const handleStart = () => {
    if (!isConnected) {
      alert('Arduino tidak terhubung! Pastikan Arduino tersambung dan backend berjalan.');
      return;
    }

    console.log('🚀 Starting test...');
    setIsTesting(true);
    setChartData([]);
    testStartTime.current = Date.now();
    
    if (socket) {
      socket.emit('start-test');
    }

    durationIntervalRef.current = setInterval(() => {
      setTestDuration(Math.floor((Date.now() - testStartTime.current) / 1000));
    }, 1000);
  };

  const handleStop = () => {
    console.log('⏸️ Stopping test... Data points:', chartData.length);
    setIsTesting(false);
    
    if (socket) {
      socket.emit('stop-test');
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    if (chartData.length === 0) {
      alert('Tidak ada data yang tercatat. Pastikan Arduino mengirim data dengan benar.');
      setTestDuration(0);
      return;
    }

    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.nama || !formData.merk_motor || !formData.nama_motor || !formData.cc_motor || !formData.nomor_wa) {
      alert('Mohon lengkapi semua data!');
      return;
    }

    if (chartData.length === 0) {
      alert('Tidak ada data test yang tersimpan!');
      return;
    }

    try {
      setLoading(true);

      const mq135Values = chartData.map(d => d.MQ135);
      const mq7Values = chartData.map(d => d.MQ7);

      const avg_mq135 = (mq135Values.reduce((sum, val) => sum + val, 0) / mq135Values.length).toFixed(2);
      const avg_mq7 = (mq7Values.reduce((sum, val) => sum + val, 0) / mq7Values.length).toFixed(2);
      const max_mq135 = Math.max(...mq135Values).toFixed(2);
      const max_mq7 = Math.max(...mq7Values).toFixed(2);

      const testResult = {
        ...formData,
        test_data: chartData,
        avg_mq135: parseFloat(avg_mq135),
        avg_mq7: parseFloat(avg_mq7),
        max_mq135: parseFloat(max_mq135),
        max_mq7: parseFloat(max_mq7),
        test_duration: testDuration
      };

      console.log('💾 Saving test result:', testResult);

      const response = await fetch(`${API_BASE_URL}/tests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testResult)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Test saved successfully, ID:', result.id);
        alert('Data berhasil disimpan!');
        setShowForm(false);
        setFormData({
          nama: '',
          merk_motor: '',
          nama_motor: '',
          cc_motor: '',
          nomor_wa: ''
        });
        setTestDuration(0);
        setChartData([]);
        fetchTestHistory();
      } else {
        throw new Error(result.error || 'Gagal menyimpan data');
      }
    } catch (error) {
      console.error('❌ Error saving test:', error);
      alert('Gagal menyimpan data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (test) => {
    try {
      setLoading(true);
      console.log('📄 Generating PDF for test ID:', test.id);
      
      const response = await fetch(`${API_BASE_URL}/tests/${test.id}/pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `test-emisi-${test.nama.replace(/\s/g, '_')}-${test.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ PDF downloaded successfully');
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      alert('Gagal generate PDF: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (testId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data ini?')) {
      return;
    }

    try {
      setLoading(true);
      console.log('🗑️ Deleting test ID:', testId);
      
      const response = await fetch(`${API_BASE_URL}/tests/${testId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Test deleted successfully');
        alert('Data berhasil dihapus!');
        fetchTestHistory();
      } else {
        throw new Error(result.error || 'Gagal menghapus data');
      }
    } catch (error) {
      console.error('❌ Error deleting test:', error);
      alert('Gagal menghapus data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (value, threshold) => {
    const safeValue = parseValidPPM(value);
    
    if (safeValue > threshold) {
      return { status: 'Bahaya', color: 'text-red-500', bg: 'bg-red-100' };
    } else if (safeValue > threshold * 0.7) {
      return { status: 'Waspada', color: 'text-yellow-500', bg: 'bg-yellow-100' };
    }
    return { status: 'Normal', color: 'text-green-500', bg: 'bg-green-100' };
  };

  const sensors = [
    { 
      name: 'MQ-135', 
      label: 'CO₂/NH₃', 
      value: parseValidPPM(data.mq135_ppm), 
      unit: 'ppm', 
      threshold: 400, 
      icon: Wind, 
      color: 'bg-purple-500' 
    },
    { 
      name: 'MQ-7', 
      label: 'CO', 
      value: parseValidPPM(data.mq7_ppm), 
      unit: 'ppm', 
      threshold: 200, 
      icon: Activity, 
      color: 'bg-red-500' 
    }
  ];

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Monitor Emisi Kendaraan</h1>
              <p className="text-slate-400">Sistem Pendeteksi Emisi Real-time</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  fetchTestHistory();
                  setShowHistory(!showHistory);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <History className="w-5 h-5" />
                Riwayat ({testHistory.length})
              </button>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                <span className="text-white">{isConnected ? 'Arduino Terhubung' : 'Arduino Terputus'}</span>
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-4 bg-slate-800 p-4 rounded-xl border border-slate-700">
            {!isTesting ? (
              <button
                onClick={handleStart}
                disabled={!isConnected || loading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
              >
                <Play className="w-5 h-5" />
                Mulai Pengetesan
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
              >
                <Square className="w-5 h-5" />
                Stop Pengetesan
              </button>
            )}
            
            {isTesting && (
              <>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-700 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span className="text-white font-mono">{formatDuration(testDuration)}</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-900 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                  <span className="text-blue-300 text-sm">Recording... ({chartData.length} data points)</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Riwayat Pengetesan</h2>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
                  <p className="text-slate-400 mt-4">Memuat data...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {testHistory.map((test) => (
                    <div key={test.id} className="bg-slate-700 rounded-xl p-4 border border-slate-600">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-slate-400 text-sm">Nama</p>
                          <p className="text-white font-semibold">{test.nama}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Motor</p>
                          <p className="text-white font-semibold">{test.merk_motor} {test.nama_motor}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">CC</p>
                          <p className="text-white font-semibold">{test.cc_motor} cc</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Tanggal</p>
                          <p className="text-white font-semibold">{new Date(test.timestamp).toLocaleDateString('id-ID')}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-slate-800 p-3 rounded-lg">
                          <p className="text-slate-400 text-xs">Rata-rata MQ-135</p>
                          <p className="text-purple-400 font-bold text-lg">{parseFloat(test.avg_mq135).toFixed(1)} ppm</p>
                        </div>
                        <div className="bg-slate-800 p-3 rounded-lg">
                          <p className="text-slate-400 text-xs">Rata-rata MQ-7</p>
                          <p className="text-red-400 font-bold text-lg">{parseFloat(test.avg_mq7).toFixed(1)} ppm</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={() => handlePrint(test)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          <Printer className="w-4 h-4" />
                          {loading ? 'Generating...' : 'Print PDF'}
                        </button>
                        <button
                          onClick={() => handleDelete(test.id)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Hapus
                        </button>
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-300 text-sm">Durasi: {formatDuration(test.test_duration)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {testHistory.length === 0 && (
                    <div className="text-center py-12">
                      <History className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400 text-lg">Belum ada riwayat pengetesan</p>
                      <p className="text-slate-500 text-sm mt-2">Mulai pengetesan untuk melihat data di sini</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form Input Data */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold text-white mb-6">Data Pemilik Kendaraan</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 mb-2">Nama Lengkap</label>
                  <input
                    type="text"
                    value={formData.nama}
                    onChange={(e) => setFormData({...formData, nama: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Merk Motor</label>
                  <input
                    type="text"
                    value={formData.merk_motor}
                    onChange={(e) => setFormData({...formData, merk_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: Honda, Yamaha"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Nama Motor</label>
                  <input
                    type="text"
                    value={formData.nama_motor}
                    onChange={(e) => setFormData({...formData, nama_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: Vario 160, NMAX"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">CC Motor</label>
                  <input
                    type="number"
                    value={formData.cc_motor}
                    onChange={(e) => setFormData({...formData, cc_motor: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: 150"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-300 mb-2">Nomor WhatsApp</label>
                  <input
                    type="tel"
                    value={formData.nomor_wa}
                    onChange={(e) => setFormData({...formData, nomor_wa: e.target.value})}
                    className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: 081234567890"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
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
                  className="px-6 py-3 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Real-time Chart */}
        {isTesting && (
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 mb-6">
            <h3 className="text-xl font-bold text-white mb-4">Grafik Real-time (Data: {chartData.length} points)</h3>
            {chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p className="text-slate-400">Menunggu data dari Arduino...</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    stroke="#94a3b8"
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #475569', 
                      borderRadius: '8px',
                      color: '#e2e8f0'
                    }}
                    labelStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="MQ135" 
                    stroke="#a855f7" 
                    strokeWidth={2} 
                    dot={false} 
                    name="MQ-135 (CO₂/NH₃) ppm" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="MQ7" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    dot={false} 
                    name="MQ-7 (CO) ppm" 
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Sensor Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sensors.map((sensor) => {
            const status = getStatus(sensor.value, sensor.threshold);
            const Icon = sensor.icon;
            
            return (
              <div key={sensor.name} className="bg-slate-800 rounded-2xl p-6 border border-slate-700 hover:border-slate-600 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 ${sensor.color} rounded-xl`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${status.bg}`}>
                    <span className={`text-sm font-medium ${status.color}`}>{status.status}</span>
                  </div>
                </div>
                
                <h3 className="text-slate-400 text-sm mb-1">{sensor.name}</h3>
                <p className="text-slate-300 text-xs mb-3">{sensor.label}</p>
                
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white">{sensor.value.toFixed(1)}</span>
                  <span className="text-slate-400 text-lg">{sensor.unit}</span>
                </div>
                
                <div className="mt-3 text-xs text-slate-500">
                  Threshold: {sensor.threshold} {sensor.unit}
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