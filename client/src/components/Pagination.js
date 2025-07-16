import React from 'react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) {
    return null; // Don't render pagination if there's only one page or less
  }

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5; // Max number of page buttons to show (excluding prev/next, including ellipses)
    const halfPagesToShow = Math.floor(maxPagesToShow / 2);

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Always show first page
      pageNumbers.push(1);

      let startPage = Math.max(2, currentPage - halfPagesToShow + (currentPage + halfPagesToShow > totalPages ? (totalPages - currentPage - halfPagesToShow +1) : 1) );
      let endPage = Math.min(totalPages - 1, currentPage + halfPagesToShow -1 + (currentPage <= halfPagesToShow ? (halfPagesToShow - currentPage +1) : 0));
      
      if (currentPage - 1 > halfPagesToShow && totalPages > maxPagesToShow) {
         if (startPage > 2) pageNumbers.push('...');
      }

      for (let i = startPage; i <= endPage; i++) {
        if(i > 1 && i < totalPages) pageNumbers.push(i);
      }
      
      if (totalPages - currentPage > halfPagesToShow -1 && totalPages > maxPagesToShow) {
        if (endPage < totalPages -1) pageNumbers.push('...');
      }
      // Always show last page
      pageNumbers.push(totalPages);
    }
    // Remove duplicates that might arise from boundary conditions with few pages
    return [...new Set(pageNumbers)]; 
  };

  const pages = getPageNumbers();

  const baseButtonClass = "mx-1 px-3 py-2 text-sm font-medium rounded-md transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50";
  const glassPanelButtonClass = "bg-white bg-opacity-30 backdrop-filter backdrop-blur-lg shadow-lg border border-white border-opacity-20";
  const textClass = "text-gray-700 hover:text-indigo-700";
  const disabledClass = "opacity-50 cursor-not-allowed";
  const activeClass = "bg-indigo-600 bg-opacity-80 text-white shadow-indigo-300/50";


  return (
    <nav className="mt-6 flex items-center justify-center" aria-label="Pagination">
      <button
        onClick={handlePrevious}
        disabled={currentPage === 1}
        className={`${baseButtonClass} ${glassPanelButtonClass} ${textClass} ${currentPage === 1 ? disabledClass : 'hover:bg-opacity-50'}`}
      >
        Previous
      </button>

      {pages.map((page, index) => (
        <button
          key={index}
          onClick={() => typeof page === 'number' && onPageChange(page)}
          disabled={typeof page !== 'number' || page === currentPage}
          className={`${baseButtonClass} ${
            page === currentPage 
              ? activeClass 
              : typeof page === 'number' 
                ? `${glassPanelButtonClass} ${textClass} hover:bg-opacity-50`
                : `${textClass} cursor-default` // Ellipsis style
          } ${typeof page !== 'number' ? 'px-2' : ''}`}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </button>
      ))}

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages}
        className={`${baseButtonClass} ${glassPanelButtonClass} ${textClass} ${currentPage === totalPages ? disabledClass : 'hover:bg-opacity-50'}`}
      >
        Next
      </button>
    </nav>
  );
};

export default Pagination; 