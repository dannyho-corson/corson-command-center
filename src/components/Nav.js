import { Link } from 'react-router-dom';

export default function Nav() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#6366F1' }}
            >
              <span className="text-white font-bold text-sm">CC</span>
            </div>
            <div>
              <Link to="/">
                <h1 className="text-white font-bold text-lg tracking-widest uppercase hover:text-indigo-300 transition-colors">
                  Corson Command Center
                </h1>
              </Link>
              <p className="text-gray-500 text-xs tracking-wide">
                Corson Agency · Hard Techno Division
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1 ml-4">
            <Link
              to="/"
              className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/artists"
              className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Artists
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-white text-sm font-semibold">Danny Ho</p>
            <p className="text-gray-500 text-xs">dho@corsonagency.com</p>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
            style={{ backgroundColor: '#6366F1' }}
          >
            DH
          </div>
        </div>
      </div>
    </nav>
  );
}
