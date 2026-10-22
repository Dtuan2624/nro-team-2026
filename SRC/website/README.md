# Website Ngọc Rồng Online

Website dùng PHP 8+, PDO MySQL và chung database với game. Cấu hình kết nối lấy từ `../admin/config.php`; hãy đổi thông tin mặc định trong file đó trước khi đưa website lên môi trường công khai.

Trên Windows, chạy `run-web.bat` để khởi động riêng website tại `http://127.0.0.1:8000`. Cần cài PHP, đưa PHP vào `PATH` và bật extension PDO MySQL. Nhấn `Ctrl+C` trong cửa sổ lệnh để dừng website.

Trang chủ, **Cơ chế game**, **Cách kiếm vật phẩm** và **Diễn đàn** là các trang riêng. Nội dung cơ chế và vật phẩm được sửa ở các tab tương ứng trong **Quản lý Website** của admin-desktop.

Đặt document root của máy chủ web trỏ vào thư mục `SRC/website` để các file cấu hình và mã nguồn ở thư mục cha không thể truy cập trực tiếp. Đăng ký tài khoản mới mặc định đóng (`registrationEnabled: false` trong `content.json`); quản trị viên có thể bật trong **Quản lý Website → Trang chủ → Mở đăng ký tài khoản mới**. Khi đóng, cả trang đăng ký lẫn yêu cầu tạo tài khoản đều bị từ chối, nhưng đăng nhập bằng tài khoản game sẵn có vẫn hoạt động. Bật HTTPS trước khi mở đăng ký tài khoản. Đăng nhập website dùng chung username/mật khẩu của tài khoản game từ bảng `account`; tài khoản bị khóa trong game cũng không thể đăng bài. Máy chủ game hiện đối chiếu mật khẩu dạng văn bản gốc trong database nên người chơi cần dùng mật khẩu riêng.

Trong admin-desktop, mở mục **Quản lý Website** để chọn thư mục triển khai có `index.php` và cập nhật nội dung, thông báo cùng liên kết tải. Website đọc nội dung từ `content.json` trong chính thư mục được triển khai.

Diễn đàn dùng các bảng `posts` và `comments` đã có trong database schema tại `SRC/sql/nro1.sql`. Nếu database triển khai thiếu hai bảng này, chỉ áp dụng phần định nghĩa hai bảng tương ứng; không nhập lại toàn bộ file dump lên database đang hoạt động.

Trong admin-desktop, **Quản lý Website → Trang chủ** quản lý nội dung và ảnh banner; các tab **Cơ chế** và **Kiếm vật phẩm** chỉnh nội dung từng trang; tab **Diễn đàn** quản lý bài viết/bình luận, ghim/bỏ ghim bài, xóa nội dung và tải/gỡ ảnh trên từng bài. Xóa bài viết sẽ xóa kèm bình luận liên quan trong cùng giao dịch database. Chỉ hỗ trợ JPEG, PNG và WebP tối đa 5 MB; mỗi bài viết tối đa hai ảnh. Người chơi cũng có thể đính kèm tối đa hai ảnh khi tạo chủ đề trên website.

Thư mục website cần cho phép PHP ghi vào `uploads/forum`; admin-desktop cũng cần quyền ghi vào thư mục `uploads` của website đã chọn.

Diễn đàn lấy avatar nhân vật từ `player.head` và bảng `head_avatar`, sau đó hiển thị ảnh tương ứng trong `data/icon/x1`. Khi triển khai website ở thư mục khác, cần giữ thư mục `data/icon/x1` ở vị trí tương đối `../data/icon/x1`; nếu không có ảnh tương ứng, website vẫn hoạt động nhưng avatar sẽ không hiển thị.
