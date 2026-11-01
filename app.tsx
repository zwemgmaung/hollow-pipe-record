import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

const logo = require('./assets/icon.png');

const STORAGE_KEY = 'hollow-pipe-receiving-record:v1';

const colors = {
  primary: '#1E3A6B',
  primaryLight: '#2D5AA0',
  bg: '#EEF2F7',
  text: '#1B2430',
  muted: '#8A94A6',
  border: '#D5DCE6',
  danger: '#D93F3F',
  success: '#1E9E5A',
};

type PipeRow = { id: string; feet: string; qty: string };
type PipeRecord = { site: string; date: string; rows: PipeRow[]; note: string };

function toNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function rowTotal(row: PipeRow): number {
  return toNumber(row.feet) * toNumber(row.qty);
}

function formatNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function createRow(): PipeRow {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, feet: '', qty: '' };
}

function today(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function createRecord(): PipeRecord {
  return { site: '', date: today(), rows: Array.from({ length: 5 }, createRow), note: '' };
}

function usePipeRecord() {
  const [record, setRecord] = useState<PipeRecord>(createRecord);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setRecord({ ...createRecord(), ...JSON.parse(raw) });
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record))
      .then(() => setSavedAt(new Date()))
      .catch(() => undefined);
  }, [record, loaded]);

  const setSite = useCallback((site: string) => setRecord((r) => ({ ...r, site })), []);
  const setDate = useCallback((date: string) => setRecord((r) => ({ ...r, date })), []);
  const setNote = useCallback((note: string) => setRecord((r) => ({ ...r, note })), []);

  const updateRow = useCallback((id: string, patch: Partial<PipeRow>) => {
    setRecord((r) => ({
      ...r,
      rows: r.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  }, []);

  const addRow = useCallback(
    () => setRecord((r) => ({ ...r, rows: [...r.rows, createRow()] })),
    []
  );

  const removeRow = useCallback((id: string) => {
    setRecord((r) => {
      const rows = r.rows.filter((row) => row.id !== id);
      return { ...r, rows: rows.length ? rows : [createRow()] };
    });
  }, []);

  const clear = useCallback(() => setRecord(createRecord()), []);

  const totals = useMemo(
    () => ({
      qty: record.rows.reduce((s, row) => s + toNumber(row.qty), 0),
      feet: record.rows.reduce((s, row) => s + rowTotal(row), 0),
    }),
    [record.rows]
  );

  return { record, loaded, savedAt, totals, setSite, setDate, setNote, updateRow, addRow, removeRow, clear };
}

async function saveViewAsJpeg(ref: React.RefObject<View | null>, fileName: string): Promise<string> {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true);
  if (!granted) throw new Error('Gallery permission denied');
  const uri = await captureRef(ref as never, {
    format: 'jpg',
    quality: 0.95,
    result: 'tmpfile',
    fileName,
  });
  await MediaLibrary.saveToLibraryAsync(uri);
  return 'Saved to Gallery';
}

type RecordTableProps = {
  rows: PipeRow[];
  totals: { qty: number; feet: number };
  capturing?: boolean;
  onChange: (id: string, patch: Partial<PipeRow>) => void;
  onRemove: (id: string) => void;
};

function RecordTable({ rows, totals, capturing, onChange, onRemove }: RecordTableProps) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.no, styles.headText]}>No</Text>
        <Text style={[styles.cell, styles.headText]}>Feet</Text>
        <Text style={[styles.cell, styles.headText]}>Qty</Text>
        <Text style={[styles.cell, styles.total, styles.headText]}>Total Feet</Text>
        {!capturing && <View style={styles.del} />}
      </View>

      {rows.map((row, i) => (
        <View key={row.id} style={[styles.row, i % 2 === 1 && styles.zebra]}>
          <Text style={[styles.cell, styles.no, styles.noText]}>{i + 1}</Text>
          <TextInput
            style={[styles.cell, styles.input]}
            value={row.feet}
            onChangeText={(t) => onChange(row.id, { feet: t.replace(/[^0-9.]/g, '') })}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
          <TextInput
            style={[styles.cell, styles.input]}
            value={row.qty}
            onChangeText={(t) => onChange(row.id, { qty: t.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
          />
          <Text style={[styles.cell, styles.total, styles.totalText]}>
            {formatNum(rowTotal(row))}
          </Text>
          {!capturing && (
            <Pressable style={styles.del} onPress={() => onRemove(row.id)} hitSlop={8}>
              <Text style={styles.delText}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}

      <View style={[styles.row, styles.foot]}>
        <Text style={[styles.cell, styles.no]} />
        <Text style={[styles.cell, styles.footText]}>Total</Text>
        <Text style={[styles.cell, styles.footText]}>{formatNum(totals.qty)}</Text>
        <Text style={[styles.cell, styles.total, styles.footText]}>{formatNum(totals.feet)}</Text>
        {!capturing && <View style={styles.del} />}
      </View>
    </View>
  );
}

export default function App() {
  const { record, loaded, savedAt, totals, setSite, setDate, setNote, updateRow, addRow, removeRow, clear } =
    usePipeRecord();
  const sheetRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState('');

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2500);
  };

  const onSave = async () => {
    setCapturing(true);
    await new Promise((r) => setTimeout(r, 150));
    try {
      const name = `pipe-record-${(record.site || 'site').replace(/\s+/g, '-')}-${Date.now()}`;
      flash(await saveViewAsJpeg(sheetRef, name));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCapturing(false);
    }
  };

  const onClear = () => {
    Alert.alert('Clear Data', 'Clear all data?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={styles.appBar}>
        <Image source={logo} style={styles.appLogo} />
        <Text style={styles.appTitle}>Hollow Pipe Receiving Record</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View ref={sheetRef} collapsable={false} style={styles.sheet}>
          <View style={styles.sheetHeader}>
            {!capturing && <Image source={logo} style={styles.sheetLogo} />}
            <Text style={styles.sheetTitle}>Hollow Pipe Receiving Record</Text>
          </View>

          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>Site:</Text>
              <TextInput
                style={styles.fieldInput}
                value={record.site}
                onChangeText={setSite}
                placeholder="Enter site name"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Date:</Text>
              <TextInput
                style={styles.fieldInput}
                value={record.date}
                onChangeText={setDate}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          <RecordTable
            rows={record.rows}
            totals={totals}
            capturing={capturing}
            onChange={updateRow}
            onRemove={removeRow}
          />

          <View style={styles.noteWrap}>
            <Text style={styles.noteLabel}>Remarks:</Text>
            <TextInput
              style={styles.noteInput}
              value={record.note}
              onChangeText={setNote}
              placeholder={capturing ? '' : 'Write remarks here'}
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
            />
          </View>

          {!capturing && <Text style={styles.credit}>Developed by Zwe Maung Maung</Text>}
        </View>

        <Pressable style={styles.addBtn} onPress={addRow}>
          <Text style={styles.addText}>+ Add Row</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.saveBtn]} onPress={onSave} disabled={capturing}>
            <Text style={styles.btnText}>{capturing ? 'Saving…' : 'Save as JPEG'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.clearBtn]} onPress={onClear}>
            <Text style={styles.btnText}>Clear Data</Text>
          </Pressable>
        </View>

        <Text style={styles.autosave}>
          {status ||
            `✓ Data Saved Automatically${savedAt ? ` · ${savedAt.toLocaleTimeString()}` : ''}`}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: Platform.OS === 'android' ? 40 : 52,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
  },
  appLogo: { width: 32, height: 32, borderRadius: 8 },
  appTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flexShrink: 1 },
  scroll: { padding: 14, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sheetHeader: { alignItems: 'center', marginBottom: 12 },
  sheetLogo: { width: 56, height: 56, borderRadius: 12, marginBottom: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  fields: { gap: 10, marginBottom: 14 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 48, fontSize: 15, fontWeight: '700', color: colors.text },
  fieldInput: {
    flex: 1,
    height: 44,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primaryLight,
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: 4,
  },
  credit: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    fontStyle: 'italic',
  },
  noteWrap: { marginTop: 14 },
  noteLabel: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  noteInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  addBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.primaryLight, fontWeight: '700', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: colors.primary },
  clearBtn: { backgroundColor: colors.danger },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  autosave: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.success,
    fontSize: 13,
    fontWeight: '600',
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  zebra: { backgroundColor: '#F6F8FB' },
  head: { backgroundColor: colors.primary, borderBottomWidth: 0 },
  headText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cell: { flex: 1, textAlign: 'center', paddingHorizontal: 4 },
  no: { flex: 0.5 },
  noText: { color: colors.muted, fontSize: 13 },
  total: { flex: 1.3 },
  input: {
    minWidth: 0,
    width: 0,
    height: 40,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  totalText: { fontWeight: '700', fontSize: 16, color: colors.text },
  del: { width: 36, alignItems: 'center', justifyContent: 'center', height: 44 },
  delText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  foot: { backgroundColor: '#E8EEF8', borderBottomWidth: 0, minHeight: 60 },
  footText: { fontWeight: '900', fontSize: 22, color: colors.primary },
});
