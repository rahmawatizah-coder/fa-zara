-- ============================================================
-- 3-sample-data.sql — OPSIONAL. Data contoh agar dashboard tidak kosong.
-- Jalankan sekali saja (jangan diulang, nanti data dobel).
-- ============================================================

insert into public.ftq (date, model, family, pn, shift, problem, description, area, qty) values
 ('2026-08-25','VF6','Engine','-','Shift 1','Cross Wire','Cross Wire cav 8,12 C038','C038',1),
 ('2026-07-10','VF9','IP','-','Shift 1','Unseated','Unseated cav 16 K03','K03',1),
 ('2026-07-09','VF8','Small','-','Shift 1','Cross Wire','Cross Wire cav 1-2 C001DF','C001DF',2),
 ('2026-06-08','VF7','Engine','-','Shift 1','Damage Connector','Damage C453','C453',2),
 ('2026-06-07','VF6','Engine','-','Shift 1','Damage Connector','Damage C238','C238',4),
 ('2026-06-06','VF6','Engine','-','Shift 1','Broken Wire','Broken Wire C117','C117',1),
 ('2026-05-05','VF5','Body','-','Shift 1','Cross Wire','Cross Wire cav 2-3 K26','K26',3),
 ('2026-05-04','VF5','Small','-','Shift 1','Damage Connector','Damage Conn M01','M01',1),
 ('2026-05-03','Minivan','Body','-','Shift 1','Damage Connector','Damage C001','C001',2),
 ('2026-05-02','Minivan','Small','-','Shift 1','Cross Wire','Cross Wire cav 2,6 D001','D001',1);

insert into public.scar ("no", date, supplier, pn, description, qty, severity, due, status) values
 ('SCAR-001','2026-05-06','PT Kabel Jaya','CBL-1001','Insulation crack',1,'Major','2026-06-05','Closed'),
 ('SCAR-002','2026-05-20','Sumber Konektor','CN-220','Terminal bent',1,'Critical','2026-06-19','Closed'),
 ('SCAR-003','2026-06-11','PT Kabel Jaya','CBL-1005','Wire gauge out of spec',1,'Critical','2026-07-11','In Progress'),
 ('SCAR-004','2026-07-02','Mitra Plastik','CLP-310','Clip dimension NG',1,'Minor','2026-08-01','Closed'),
 ('SCAR-005','2026-07-18','Sumber Konektor','CN-225','Housing burr',1,'Major','2026-08-17','In Progress'),
 ('SCAR-006','2026-08-04','Tegar Terminal','TRM-77','Plating peel off',1,'Major','2026-09-03','Open'),
 ('SCAR-007','2026-08-21','Mitra Plastik','CLP-312','Color mismatch',1,'Minor','2026-09-20','Open');

insert into public.redtag ("no", date, pn, area, reason, qty, disposition, status) values
 ('RT-001','2026-05-08','CBL-1001','Incoming QC','Defect',40,'Return to Supplier','Closed'),
 ('RT-002','2026-05-22','CN-220','Line 2','Damaged',15,'Scrap','Closed'),
 ('RT-003','2026-06-12','HRN-6040','Assembly','Wrong Part',6,'Rework','Closed'),
 ('RT-004','2026-07-03','CLP-310','Warehouse','Quarantine',200,'Use As Is','Closed'),
 ('RT-005','2026-07-19','HRN-7011','Line 1','Defect',12,'Rework','Open'),
 ('RT-006','2026-08-05','TRM-77','Incoming QC','Defect',55,'Return to Supplier','Open'),
 ('RT-007','2026-08-22','HRN-6041','Final Inspection','Damaged',9,'Scrap','Open'),
 ('RT-008','2026-08-24','CN-225','Line 2','Quarantine',30,'Rework','Open');
