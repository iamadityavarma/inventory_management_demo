const Header = () => {

  return (
    <header className="flex justify-between items-center mb-8 pt-4">
      <div className="flex items-center">
        <div className="mr-3">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 5L35 30H5L20 5Z" fill="rgba(0,0,0,0.03)" stroke="#111827" strokeWidth="1.5" />
            <circle cx="20" cy="25" r="10" fill="rgba(0,0,0,0.03)" stroke="#111827" strokeWidth="1.5" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">ZentroQ</h1>
          <p className="text-gray-500 text-sm tracking-wide">INVENTORY MANAGEMENT SYSTEM</p>
        </div>
      </div>
      
    </header>
  );
};

export default Header;