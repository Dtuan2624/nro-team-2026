# Ngọc Rồng Online - Teamobi 2026

> [!NOTE]
> **Lưu ý:** Source code chỉ mang tính chất học tập, nghiên cứu và phát triển kỹ năng lập trình, hoàn toàn phi thương mại.

Dự án máy chủ game Ngọc Rồng Online (NRO) phiên bản Teamobi 2026 bao gồm Game Server (Java 17), Desktop Admin Panel (Electron), Website cộng đồng / diễn đàn (PHP), và cơ sở dữ liệu mẫu.

---

## 📁 Cấu trúc thư mục

```text
Teamobi2026/
├── SRC/
│   ├── src/                  # Mã nguồn Java Game Server
│   ├── lib/                  # Thư viện phụ thuộc (.jar)
│   ├── data/                 # Dữ liệu game (icon, map, hiệu ứng)
│   ├── admin-desktop/        # Ứng dụng Desktop quản trị (Electron + Node.js)
│   ├── website/              # Website người chơi, diễn đàn, giới thiệu (PHP 8+)
│   ├── admin/                # Cấu hình kết nối cho hệ thống web/admin
│   ├── sql/                  # Các file SQL bổ sung (nro1.sql, ...)
│   ├── Config.properties     # Cấu hình IP, Port, Database Game Server
│   ├── run.bat               # Script tự động compile Java 17 & chạy Server
│   └── runWithPanel.bat      # Script chạy Server kèm Panel quản trị
├── database team2026.sql     # File dump cơ sở dữ liệu MySQL chính (team2026)
├── item.xlsx                 # Bảng tra cứu danh sách vật phẩm trong game
├── Lệnh admin.docx           # Tài liệu hướng dẫn các lệnh Admin trong game
└── .gitignore                # Cấu hình bỏ qua cache, build, node_modules
```

---

## ⚙️ Yêu cầu môi trường

- **Java Development Kit (JDK)**: Java 17 hoặc mới hơn
- **Cơ sở dữ liệu**: MySQL 5.7+ / MariaDB (hoặc XAMPP / Laragon / WampServer)
- **Node.js & npm**: Node.js 16+ (dành cho Admin Desktop)
- **PHP**: PHP 8.0+ với extension `pdo_mysql` (dành cho Website)

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Cài đặt Cơ sở dữ liệu (Database)
1. Khởi động MySQL service (thông qua XAMPP, Laragon, hoặc MySQL CLI/Workbench).
2. Tạo database mới với tên:
   ```sql
   CREATE DATABASE team2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. Import file `database team2026.sql` vào database vừa tạo.

### 2. Cấu hình Server
Mở file `SRC/Config.properties` và cập nhật thông tin tương ứng với máy chủ của bạn:
```properties
# SERVER
server.name=NRO
server.ip=127.0.0.1
server.port=14445
server.maxplayer=1000

# DATABASE
database.host=localhost
database.port=3306
database.name=team2026
database.user=root
database.pass=
```

### 3. Biên dịch & Chạy Game Server
- Di chuyển vào thư mục `SRC/` và chạy:
  ```cmd
  run.bat
  ```
  Script sẽ tự động tìm kiếm các file `.java`, compile theo chuẩn Java 17, đóng gói thành `20.jar` và khởi chạy server `ServerManager`.
- Hoặc chạy `runWithPanel.bat` để chạy server cùng giao diện dòng lệnh quản trị.

---

## 🖥️ Quản trị Admin Desktop (Electron)

Nằm trong thư mục `SRC/admin-desktop`:
1. Mở terminal tại `SRC/admin-desktop`:
   ```bash
   npm install
   npm start
   ```
2. Ứng dụng cung cấp giao diện trực quan để:
   - Theo dõi tài khoản, nhân vật, tài nguyên, đồ đạc.
   - Quản lý nội dung website, banner, thông báo, liên kết tải game.
   - Quản lý diễn đàn, duyệt/ghim/xóa bài viết và kiểm duyệt hình ảnh.

---

## 🌐 Website & Diễn đàn (PHP)

Nằm trong thư mục `SRC/website`:
- Xem hướng dẫn chi tiết tại `SRC/website/README.md`.
- Để chạy thử nghiệm nhanh trên máy cục bộ, mở terminal tại `SRC/website` và chạy:
  ```cmd
  run-web.bat
  ```
- Website sẽ lắng nghe tại `http://127.0.0.1:8000`.

---

## 📝 Tài liệu & Lệnh Admin

- Tra cứu danh sách ID vật phẩm: xem file `item.xlsx`.
- Các câu lệnh admin trong game (buff đồ, tăng sức mạnh, dịch chuyển, quản lý người chơi): xem file `Lệnh admin.docx`.

---

## 🔒 Lưu ý bảo mật
- Đổi thông tin mật khẩu mặc định của cơ sở dữ liệu trước khi đưa lên môi trường Internet/VPS.
- Không public file cấu hình chứa token hoặc thông tin nhạy cảm.
- Khi triển khai web, trỏ Document Root trực tiếp vào `SRC/website/` để tránh lộ source code thư mục cha.
