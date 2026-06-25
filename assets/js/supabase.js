// ==========================================
// KONFIGURASI DATABASE SUPABASE
// File ini berisi konfigurasi koneksi ke Supabase PostgreSQL.
// ==========================================

const SUPABASE_URL = 'https://gleledmxzvbqoevpjjgd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsZWxlZG14enZicW9ldnBqamdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzU2NzAsImV4cCI6MjA5NzcxMTY3MH0.AV6qkdsjRB2p1MpJs0szZOYT5SjwMHehS0WRKJ-Xe2g';

// Inisialisasi Supabase client menggunakan UMD build dari CDN
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);